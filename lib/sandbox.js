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
  (this.options = options || {}).__proto__ = Sandbox.options;
}

// Make the Sandbox class an event emitter to handle messages
util.inherits(Sandbox, EventEmitter);


//-----------------------------------------------------------------------------
// Instance Methods
//-----------------------------------------------------------------------------

Sandbox.prototype.run = function(code, hollaback) {
  var self = this;
  var timer;
  var stdout = '';
  self.child = spawn(this.options.node, [this.options.shovel], { stdio: ['pipe', 'pipe', 'pipe', 'ipc'] });
  var output = function(data) {
    if (!!data)
      stdout += data;
  };

  if (typeof hollaback == 'undefined')
    hollaback = console.log;
  else
    hollaback = hollaback.bind(this);

  // Listen
  self.child.stdout.on('data', output);

  // Pass messages out from child process
  self.child.on('message', function(message){
    self.emit('message', message);
  });
  
  self.child.on('exit', function(code) {
    clearTimeout(timer);
    setImmediate(function(){
      if (!code && !stdout)
        hollaback({ result: 'Error', console: [] });
      else
        hollaback(JSON.parse(stdout));
    });
  });

  // Go
  self.child.stdin.write(code);
  self.child.stdin.end();
  timer = setTimeout(function() {
    self.child.stdout.removeListener('output', output);
    stdout = JSON.stringify({ result: 'TimeoutError', console: [] });
    self.child.kill('SIGKILL');
  }, this.options.timeout);
};

Sandbox.prototype.postMessage = function(message, callback) {
  self.child.send(message);
};


//-----------------------------------------------------------------------------
// Class Properties
//-----------------------------------------------------------------------------

Sandbox.options = {
  timeout: 500,
  node:    'node',
  shovel:  path.join(__dirname, 'shovel.js')
};

fs.readFile(path.join(__dirname, '..', 'package.json'), function(err, data) {
  if (err)
    throw err;
  else
    Sandbox.info = JSON.parse(data);
});


//-----------------------------------------------------------------------------
// Export
//-----------------------------------------------------------------------------

module.exports = Sandbox;
