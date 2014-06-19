//-----------------------------------------------------------------------------
// Init
//-----------------------------------------------------------------------------

var fs           = require('fs');
var path         = require('path');
var spawn        = require('child_process').spawn;
var util         = require('util');
var EventEmitter = require('events').EventEmitter;

//-----------------------------------------------------------------------------
// Constructor
//-----------------------------------------------------------------------------


function Sandbox(options) {
  var self = this;
  
  // message_queue is used to store messages that are meant to be sent
  // to the sandbox before the sandbox is ready to process them
  self._ready = false;
  self._message_queue = [];

  // _stdout assigned to instance so it can be overwritten for testing
  self._stdout = process.stdout;
  
  self.options = {
    timeout: 500,
    node:    'node',
    shovel:  path.join(__dirname, 'shovel.js')
  };

  self.info = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json')));
}

// Make the Sandbox class an event emitter to handle messages
util.inherits(Sandbox, EventEmitter);


//-----------------------------------------------------------------------------
// Instance Methods
//-----------------------------------------------------------------------------

Sandbox.prototype.run = function(code, callback) {
  var self = this;
  self.timer;

  // Spawn child process
  self.child = spawn(this.options.node, [this.options.shovel], { stdio: ['pipe', 'pipe', 'pipe', 'ipc'] });

  // Pass stdout output on
  self.child.stdout.on('data', self._stdoutHandler.bind(self));

  // Pass errors to callback
  var stderr_output = '';
  self.child.stderr.on('data', function(err){
    stderr_output += String(err);
  });
  self.child.stderr.on('end', function(){
    if (stderr_output) {
      callback(stderr_output);
      self.kill();
    }
  });

  // Pass messages out from child process
  // These messages can be handled by Sandbox.on('message', function(message){...});
  self.child.on('message', function(message){

    if (typeof message !== 'object' || typeof message.type !== 'string') {
      callback(new Error('Bad IPC message: ' + String(message)));
      self.kill();
      return;
    }

    if (message.type === 'ready') {
      self.emit('ready');
      self._ready = true;
      
      // Process the _message_queue
      while(self._message_queue.length > 0) {
        self.postMessage(self._message_queue.shift());
      }
    } else if (message.type === 'result') {
      callback(null, JSON.stringify(message.data));
      self.kill();
    } else if (message.type === 'message') {
      self.emit(message.data);
    } else {
      callback(new Error('Bad IPC message: ' + String(message)));
      self.kill();
      return;
    }

  });
  
  self.child.on('exit', function(code) {
    self.kill();
  });

  // Write user code to sandbox through stdin
  self.child.stdin.write(code);
  self.child.stdin.end();
  
  timer = setTimeout(function() {
    callback('TimeoutError');
    self.kill();
  }, self.options.timeout);
};

// Method assigned to prototype so it can be overwritten for testing
// self._stdout used for testing
Sandbox.prototype._stdoutHandler = function(data) {
  var self = this;

  // Should this use JSON.stringify for security?
  self._stdout.write(String(data));
};

// Send a message to the code running inside the sandbox
// This message will be passed to the sandboxed 
// code's `onmessage` function, if defined.
// Messages posted before the sandbox is ready will be queued
Sandbox.prototype.postMessage = function(message) {
  var self = this;
  
  if (self._ready) {
    self.child.send(message);
  } else {
    self._message_queue.push(message);
  }
};

Sandbox.prototype.kill = function(){
  var self = this;

  clearTimeout(self.timer);
  self.child.stdout.removeListener('data', self._stdoutHandler);
  self.child.kill('SIGKILL');
};

//-----------------------------------------------------------------------------
// Export
//-----------------------------------------------------------------------------

module.exports = Sandbox;
