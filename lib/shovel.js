var util               = require('util');
var vm                 = require('vm');
var fs                 = require('fs');
var FileSystemReadOnly = require('./fs-read-only');

//-----------------------------------------------------------------------------
// Sandbox
//-----------------------------------------------------------------------------

var code    = '';
var stdin   = process.openStdin();
var result;

var sandbox_filesystem_path = process.argv[2];
var manifest_hash = process.argv[3];

var manifest;
try {
  manifest = fs.readFileSync(sandbox_filesystem_path + manifest_hash, { encoding: 'utf8' });
  manifest = JSON.parse(manifest);
} catch(error) {
  throw new Error('Error reading code manifest. ' + error);
}

var fsreadonly = new FileSystemReadOnly(sandbox_filesystem_path, manifest);

// Get code
stdin.on('data', function(data) {
  code += data;
});
stdin.on('end', run);

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
    };
    var __readFileSync = function(path) {
      "use strict";
      return comm.__readFileSync(JSON.stringify([ path ]));
    }
    var exit = function exit(){
      "use strict";
      onmessage = null;
      comm.exit();
    };
    global.console = { log: send.bind(global, 'stdout') };

    // Modify timers to set the __outstanding_timers variable
    global.__outstanding_timers = 0;
    function wrapTimer(fn) {
      "use strict";
      return function(){
        global.__outstanding_timers += 1;
        var callback = arguments[0];
        arguments[0] = function() {
          callback();
          global.__outstanding_timers -= 1;
          global.__check_finished();
        };
        fn.apply(global, arguments);
      };
    }
    global.setImmediate = wrapTimer(comm.timers.setImmediate).bind(global);
    global.clearImmediate = wrapTimer(comm.timers.clearImmediate).bind(global);
    global.setTimeout = wrapTimer(comm.timers.setTimeout).bind(global);
    global.clearTimeout = wrapTimer(comm.timers.clearTimeout).bind(global);

    global.print = send.bind(global, 'stdout');
    global.console = { log: send.bind(global, 'stdout') };
    global.process = {
      stdout: { write: send.bind(global, 'stdout') },
      exit: exit,
      nextTick: global.setImmediate.bind(global),
      version: comm.vars.node_version
    };
    global.__check_finished = function() {
      if (typeof onmessage !== 'function' && global.__outstanding_timers === 0) {
        process.exit();
      }
    };
    global.postMessage = send.bind(global, 'message');
    global.__readFileSync = __readFileSync.bind(global);
    global.global = global._global = global;

    // This is where the user's source code is actually evaluated
    var result = UserScript(src)();
    send('end', result);
  }
};

// Run code
function run() {

  var context = vm.createContext();
  var safeRunner = vm.runInContext('('+getSafeRunner.toString()+')()', context);

  try {
    safeRunner({
      send: function (event, value) {
        "use strict";

        switch (event) {
          case 'stdout':
            process.stdout.write(JSON.parse(value)[0] + '\n');
            break;
          case 'end':
            result = JSON.parse(value)[0];
            break;
          case 'message':
            process.send({ type: 'message', data: JSON.parse(value)[0] });
            break;
          default:
            throw new Error('Unknown event type');
        }
      },
      exit: function(){
        processExit();
      },
      __readFileSync: function(path) {
        path = JSON.parse(path)[0];
        return fsreadonly.readFileSync(String(path));
      },
      timers: {
        setTimeout: wrapTimer(context, setTimeout),
        clearTimeout: wrapTimer(context, clearTimeout),
        setImmediate: wrapTimer(context, setImmediate),
        clearImmediate: wrapTimer(context, clearImmediate)
      },
      vars: {
        node_version: String(process.version)
      }
    }, code);
  }
  catch (e) {
    console.log(e.stack);
    return;
  }

  process.on('message', processMessageListener.bind(null, context));

  process.send({ type: 'ready' });

  // This will exit the process if onmessage was not defined
  checkIfProcessFinished(context);
};

// If the sandboxed code has defined an `onmessage` function, pass the message
// we received to it. Note that we are still worried about what external users
// might pass in to the sandboxed code
function processMessageListener(context, message){
  vm.runInContext('if (typeof onmessage === "function") { onmessage('+ JSON.stringify(String(message)) + '); }', context);
  checkIfProcessFinished(context);
};

// The process should only be considered finished if `onmessage` is not set
// or if the sandboxed code calls `process.exit()` explicitly
function checkIfProcessFinished(context) {
  if(vm.runInContext('typeof onmessage', context) !== 'function' && vm.runInContext('__outstanding_timers', context) <= 0) {
    processExit();
  }
};

// Send the result to the parent process and exit this process
function processExit() {
  console.log('processExit')

  process.removeListener('message', processMessageListener);

  process.send({ type: 'result', data: result });

  process.exit(0);
};

function wrapTimer(context, fn) {
  return function(){
    var timer_context = this;
    var callback = arguments[0];
    arguments[0] = function() {
      callback();
      // checkIfProcessFinished(context);
    };
    fn.apply(timer_context, arguments);
    return;
  };
}
