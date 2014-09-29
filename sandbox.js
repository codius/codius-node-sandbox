var fs = require('fs');
var spawn = require('child_process').spawn;
var util = require('util');
var path = require('path');
var EventEmitter = require('events').EventEmitter;
var MessageHandler = require('./lib/message-handler').MessageHandler;

// TODO: Make these configurable
var NACL_SDK_ROOT = process.env.NACL_SDK_ROOT || path.resolve(__dirname, 'deps/nacl_sdk/pepper_35');
var RUN_CONTRACT_COMMAND = path.resolve(NACL_SDK_ROOT, 'tools/sel_ldr_x86_32');
var RUN_CONTRACT_LIBS = [
	path.resolve(__dirname, 'deps/v8/out/nacl_ia32.release/lib.target'),
	path.resolve(NACL_SDK_ROOT, 'toolchain/linux_x86_glibc/x86_64-nacl/lib32'),
];
var RUN_CONTRACT_ARGS = [
  '-h', 
  '3:3', 
  '-h',
  '4:4',
  '-a', 
  '--', 
  path.resolve(NACL_SDK_ROOT, 'toolchain/linux_x86_glibc/x86_64-nacl/lib32/runnable-ld.so'), 
  '--library-path', 
  RUN_CONTRACT_LIBS.join(':'),
  path.resolve(__dirname, 'deps/codius_node.nexe')
];

/**
 * Sandbox class wrapper around Native Client
 */
function Sandbox(opts) {
	var self = this;
	
	if (!opts) {
		opts = {};
	}

	self._api = opts.api;
	self._timeout = opts.timeout || 1000;
	self._enableGdb = opts.enableGdb || false;
	self._enableValgrind = opts.enableValgrind || false;
	self._stdout_dest = (opts.passthroughStdio ? process.stdout : null);
	self._stderr_dest = (opts.passthroughStdio ? process.stderr : null);

	// Set when Sandbox.run is called
	self._stdio = null;
	self._message_handler = null;
	self._native_client_child = null;

}
util.inherits(Sandbox, EventEmitter);

/**
 *	Set the API
 */
Sandbox.prototype.setApi = function(api) {
	var self = this;
	self._message_handler.setApi(api);
};

/**
 * Run the given file inside the sandbox
 *
 * @param {String} file_path
 */
Sandbox.prototype.run = function(file_path) {
	var self = this;

	// Create new sandbox
	self._native_client_child = self._spawnChildToRunCode(file_path);
	self._native_client_child.on('exit', function(code){
		self.emit('exit', code);
	});
	self._stdio = self._native_client_child.stdio;

	if (self._stdout_dest) {
		self._stdio[1].pipe(self._stdout_dest);
	}

	if (self._stderr_dest) {
		self._stdio[2].pipe(self._stderr_dest);
	}

	self._message_handler = new MessageHandler({
		api: self._api,
		stdio: self._stdio
	});

};

Sandbox.prototype._spawnChildToRunCode = function (file_path) {
	var self = this;

	var cmd = RUN_CONTRACT_COMMAND;
	var args = RUN_CONTRACT_ARGS.slice();
	args.push(file_path);
	
	if (self._enableGdb) {
		args.unshift(cmd);
		args.unshift('localhost:4484');
		cmd = 'gdbserver';
	} else if (self._enableValgrind) {
		args.unshift('--');
		args.unshift(cmd);
		cmd = 'valgrind';
	}

	var child = spawn(cmd, args, { stdio: [ 'pipe', 'pipe', 'pipe', 'pipe',  'pipe' ] });

	return child;
};

/**
 * Kill the sandbox process.
 *
 * @param {String} ['SIGKILL'] message
 */
Sandbox.prototype.kill = function(message){
	var self = this;

	if (self._native_client_child) {
		self._native_client_child.kill(message);
	}
};

/**
 * Pipe Native Client stdout and stderr to 
 * the parent process' stdout and stderr
 */
Sandbox.prototype.passthroughStdio = function() {
	var self = this;

	self._passthrough_stdio = true;
};

/**
 * Set up the sandbox's `stdout` stream to be piped to 
 * the given destination when the child process is spawned
 */
Sandbox.prototype.pipeStdout = function(dest) {
	var self = this;

	self._stdout_dest = dest; 
};

/**
 * Set up the sandbox's `stderr` stream to be piped to 
 * the given destination when the child process is spawned
 */
Sandbox.prototype.pipeStderr = function(dest) {
	var self = this;

	self._stderr_dest = dest; 
};

module.exports = Sandbox;
