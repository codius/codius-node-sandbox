//-----------------------------------------------------------------------------
// Init
//-----------------------------------------------------------------------------

var util = require('util')
var code;
var result;
var console;
var sandbox;
var Script;
var stdin;
var callback_stack = [];

if (!(Script = process.binding( 'evals').NodeScript))
  if (!(Script = process.binding('evals').Script))
    Script = require('vm');


//-----------------------------------------------------------------------------
// Sandbox
//-----------------------------------------------------------------------------

// Get code
console = [];
code    = '';
stdin   = process.openStdin();
stdin.on('data', function(data) {
  code += data;
});
stdin.on('end', run);

// Add the given callback to the callback_stack and
// return its index in the array
function addToCallbackStack(callback) {

  callback_stack.push(callback);
  return callback_stack.length - 1;

}

// Retrieve a callback specified by the given index
// from the callback stack. Returns the callback
// or throws an error if the callback has already been used
// or the index does not correspond to a function
function retrieveFromCallbackStack(index) {

  if (index >= callback_stack.length) {
    throw new Error('Cannot retrieve callback from stack: array index out of bounds');
  } else if (typeof callback_stack[index] !== 'function') {
    throw new Error('Cannot retrieve callback from stack: callback already called');
  } else {
    return callback_stack[index];
  }

}

function getSafeRunner() {
  var global = this;
  // Keep it outside of strict mode
  function UserScript(str) {
    // We want a global scoped function that has implicit returns.
    return Function('return eval('+JSON.stringify(str+'')+')');
  }
  // place with a closure that is not exposed thanks to strict mode
  return function run(comm, src) {
    // stop argument / caller attacks
    "use strict";
    var send = function send(event) {
      "use strict";
      //
      // All comm must be serialized properly to avoid attacks, JSON or XJSON
      //
      comm.send(event, JSON.stringify([].slice.call(arguments,1)));
    }
    global.print = send.bind(global, 'stdout');
    global.console = { log: send.bind(global, 'stdout') };
    global.process = { stdout: { write: send.bind(global, 'stdout') } };


    global.postMessage = function(message, callback) {
      send.bind(global, 'message');
      addToCallbackStack(callback);
    };

    // This method can be overwritten by the sandboxed code to handle
    // messages send by the outside into the sandbox
    global.onMessage = function(message){};

    process.on('message', global.onMessage);

    var result = UserScript(src)();
    // send('end', result);
  }
}

// Run code
function run() {
  var context = Script.createContext();
  var safeRunner = Script.runInContext('('+getSafeRunner.toString()+')()', context);
  var result;
  try {
    safeRunner({
      send: function (event, value) {
        "use strict";

        switch (event) {
          case 'stdout':
            console.push(JSON.parse(value)[0]);
            break;
          case 'end':
            result = JSON.parse(value)[0];
            break;
          case 'message':
            process.send(JSON.parse(value)[0]);
            break;
        }
      }
    }, code);
  }
  catch (e) {
    result = e.name + ': ' + e.message;
    // throw e;
  }

  process.stdout.on('drain', function() {
    process.exit(0);
  });

  process.stdout.write(JSON.stringify({ result: util.inspect(result), console: console }));
}
