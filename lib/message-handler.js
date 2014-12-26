var util = require('util');
var format = require('./rpc-binary-format');
var RpcParser = require('./rpc-parser').RpcParser;

function AsyncResponse(callback_id, response_message) {
  var self = this;

  self.callback_id = callback_id;
  self.message = response_message;
}

/**
 * Class responsible for parsing and handling messages
 * sent from inside the sandbox. It uses the RpcParser
 * and the API supplied.
 *
 * @param {Function} opts.api
 */
function MessageHandler(opts) {
  var self = this;

  if (!opts) {
    opts = {};
  }

  self._api = opts.api;
  self._stdio = null;

  // Queue of pending async responses waiting to be read by the sandbox
  self._async_responses = [];

  // Setup the RpcParser to receive data sent from the sandbox on fd 3
  self._rpc_parser = new RpcParser();
  self._rpc_parser.on('message', self.handleMessage.bind(self));

}

/**
 * Set the API that will be used to handle messages of type 'api'
 *
 * @param {Function} api A function that accepts a message object and a callback function as arguments
 */
MessageHandler.prototype.setApi = function(api) {
  var self = this;

  self._api = api;
};

MessageHandler.prototype.setupStdio = function(stdio) {
  var self = this;

  if (!stdio || stdio.length < 4) {
    throw new Error('Invalid stdio array, must have 4 fd streams');
  }

  if (self._stdio) {
    self._stdio[3].unpipe(self._rpc_parser);
  }
  self._stdio = stdio;

  self._stdio[3].pipe(self._rpc_parser);
  
};

/**
 * Messages will either be passed to the API or will
 * trigger the sending of the next async response.
 *
 * @param {String|Buffer} message_string
 * @param {Number} callback_id
 */
MessageHandler.prototype.handleMessage = function(message_string, callback_id) {
  var self = this;

  var message;
  var callback;

  if (callback_id === 0) {
    callback = self._syncCallback.bind(self);
  } else if (callback_id > 0) {
    callback = self._asyncCallback.bind(self, callback_id);
  } else {
    // TODO: do not throw an error here, handle this in another way
    throw new Error('Invalid callback_id: ' + callback_id);
  }

  // Parse the message_string into a JSON object
  try {
    message = JSON.parse(message_string);
  } catch (e) {
    callback(new Error('Error parsing message JSON: ' + e));
    return;
  }

  // console.log('>>>', message, '(' + (callback_id === 0 ? 'sync' : 'async') + ')');

  // Allowed message types are 'api' and 'request_async_response'
  if (message.type === 'request_async_response') {
    self._writeNextAsyncResponse();
  } else if (message.type === 'api') {

    if (typeof self._api === 'function') { 
      self._api(message, callback);
    } else {
      callback(new Error('No API provided to handle message'));
      return;
    }

  } else if (!message.type){
    callback(new Error('Must supply message type'));
    return;
  } else {
    callback(new Error('Invalid message type: ' + String(message.type)));
    return;
  }

};

/**
 * Pass the next async API call response into the sandbox
 */
MessageHandler.prototype._writeNextAsyncResponse = function() {
  var self = this;

  // Don't try to write if the pipes have been closed
  // (most likely because the sandbox was killed)
  if (!self._stdio || !self._stdio[3]) {
    return;
  }

  var asyncResponse = self._async_responses.shift();
  var headerBuffer = createResponseHeader(asyncResponse);


  self._stdio[3].write(headerBuffer);


  // If there is no message the header will inform the sandbox of that
  if (asyncResponse) {
    self._stdio[3].write(asyncResponse.message);
  }
};

MessageHandler.prototype._processError = function (error) {
  if (typeof error === 'object') {
    // Error objects need special handling in order to be serializable as JSON
    if (util.isError(error)) {
      // Copy all properties onto a plain object
      var alt = {};

      Object.getOwnPropertyNames(error).forEach(function (key) {
          alt[key] = error[key];
      });

      return alt;
    } else {
      // Other objects are passed through unmodified
      // TODO Should we restrict what error information hosts expose?
      return error;
    }
  } else if (typeof error === 'string') {
    return {
      message: error
    };
  } else {
    console.error('Strange error of type: ' + (typeof error));
    return null;
  }
};

/**
 * The callback used for async API calls
 */
MessageHandler.prototype._asyncCallback = function (callback_id, error, result, result2) {
  var self = this;

  if (error) {
    error = self._processError(error);
  } else {
    error = null;
  }

  var response = {
    type: 'callback',
    error: error,
    result: result2 ? [ result, result2 ] : result
  };

  var responseString = JSON.stringify(response);
  var responseBuffer = new Buffer(responseString, 'utf8');

 // console.log('<<< ', responseString);

  // Store the asynchronous response message to be retrieved by a synchronous request.
  self._async_responses.push(new AsyncResponse(callback_id, responseBuffer));
};

/**
 * The callback used for synchronous API calls
 */
MessageHandler.prototype._syncCallback = function (error, result, result2) {
  var self = this;

  // Don't try to write if the pipes have been closed
  // (most likely because the sandbox was killed)
  if (!self._stdio || !self._stdio[3]) {
    return;
  }

  if (error) {
    error = self._processError(error);
  } else {
    error = null;
  }
  
  var response = {
    type: 'callback',
    error: error,
    result: result2 ? [ result, result2 ] : result
  };

  // Send back the synchronous response message
  var responseString = JSON.stringify(response);
  var responseBuffer = new Buffer(responseString, 'utf8');
  var headerBuffer = createResponseHeader({ message: responseBuffer });

 //  if (result !== -11)
 // console.log('<<< ', responseString);

  self._stdio[3].write(headerBuffer);
  self._stdio[3].write(responseBuffer);
};

function createResponseHeader(resp) {
  var headerBuffer = new Buffer(format.HEADER_SIZE);
  headerBuffer.writeUInt32LE(format.MAGIC_BYTES, 0);
  headerBuffer.writeUInt32LE(resp && resp.callback_id ? resp.callback_id: 0, 4);
  headerBuffer.writeUInt32LE(resp ? resp.message.length : 0, 8);

  return headerBuffer;
}

exports.MessageHandler = MessageHandler;
