//-----------------------------------------------------------------------------
// Init
//-----------------------------------------------------------------------------

var util = require('util');
var callback_stack = [];
var code;
var result;
var console;
var sandbox;
var Script;
var stdin;

if (!(Script = process.binding( 'evals').NodeScript))
  if (!(Script = process.binding('evals').Script))
    Script = require('vm');

//-----------------------------------------------------------------------------
// Sandbox
//-----------------------------------------------------------------------------

// Get code
console = [];
// code    = '';
// stdin   = process.openStdin();
// stdin.on('data', function(data) {
//   code += data;
// });
// stdin.on('end', run);
code = 'var hello = 1; var onmessage = function(message) { console.log(message); done(); };';
run();


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
    global.postMessage = send.bind(global, 'message');
    global.done = comm.finish.bind(global);
  };
}

// Run code
function run() {
  var context = Script.createContext();
  var safeRunner = Script.runInContext('('+getSafeRunner.toString()+')()', context);

  process.on('message', function (message) {
    if (typeof context.onmessage === 'function') {
      context.onmessage(message);
    }
  });
  
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
      },
      finish: endProcess.bind(this)
    }, code);
  }
  catch (e) {
    result = e.name + ': ' + e.message;
    // throw e;
  }

  util.log(JSON.stringify(context));

}

function endProcess() {
  process.stdout.on('drain', function() {
    process.exit(0);
  });

  // Note that result and console are declared with global scope
  process.stdout.write(JSON.stringify({ result: util.inspect(result), console: console }));
}
