var fs = require('fs');
var path = require('path');
var dns = require('dns');
var net = require('net');
var crypto = require('crypto');
var FakeSocket = require('./fake-socket').FakeSocket;


function passthroughApi(message, callback) {
	var args;
	if (typeof message.data === 'string') {
		args = [message.data];
	} else if (typeof message.data === 'object') {
		args = message.data;
	}

  var method = (message.method || '').replace(/sync/i, '');
	
	args.push(callback);

  switch(message.api) {
    case 'fs':
      // Make absolute paths relative
      // (They are absolute from the perspect of the sandboxed code)
      if (args[0].indexOf('/') === 0) {
        args[0] = '.' + args[0];
      }
      fs[method].apply(null, args);
      break;
    case 'dns':
      dns[method].apply(null, args);
      break;
    case 'net':
    	var sock;
      switch (method) {
    		case 'socket':
    			sock = new FakeSocket(args[0], args[1], args[2]);
      		var connectionId = this._connections.length;
      		this._connections.push(sock);
    			args[3](null, connectionId);
    			break;
        case 'write':
          if (args[2]==="hex") {
            args[1] = new Buffer(args[1], "hex");
            args.splice(2, 1);
          }
          sock = this._connections[args[0]];
    			sock[method].apply(sock, args.slice(1));
          break;
        case 'connect':
        case 'read':
        case 'close':
          //TODO-CODIUS: If 'close', remove socket from _connections array
    			sock = this._connections[args[0]];
    			sock[method].apply(sock, args.slice(1));
    			break;
    		default:
    			callback(new Error('Unhandled net method: ' + message.method));
    	}
      break;
    case 'crypto':
      switch(method) {
        case 'randomBytes':
          // Convert the resulting buffer to hex
          function randomBytesCallback(error, result){
            if (error) {
              callback(error);
            } else if (Buffer.isBuffer(result)) {
              result = result.toString('hex');
              callback(null, result);
            }
          }
          
          args[args.length - 1] = randomBytesCallback;
          crypto.randomBytes.apply(null, args);
          break;
        default:
    			callback(new Error('Unhandled net method: ' + message.method));
      }
      break;
    default:
      callback(new Error('Unhandled api type: ' + message.api));
  }
}

exports.passthroughApi = passthroughApi;
