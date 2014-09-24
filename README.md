# Codius Node Sandbox

--> **This code is not yet ready for production use** <--

A sandbox that combines Google's [Native Client](https://developer.chrome.com/native-client) with the [`codius/codius-lang-js`](https://github.com/codius/codius-lang-js) build of Node.js to run untrusted Javascript code.

## Installation

`npm install`

## Run a file inside the Sandbox

`bin/codius-run path/to/file.js`

## API

### Instantiating a `new Sandbox`

```js
var Sandbox = require('codius-node-sandbox');

// This function defines how messages sent from inside
// the sandbox will be handled. If no function is supplied
// 
function apiHandler(message, callback) {
  var args = message.data.push(callback);

  switch(message.api) {
    case 'fs':
      switch(message.method) {
        case 'readFile':
          fs.readFile.apply(null, args);
          break;
      }
    break;
  }
}

var sandbox = new Sandbox({
  api: apiHandler
});
```

### `Sandbox.run(file_path)`

Spawn a new Native Client sandbox as a child process to run the given Node.js file.

### `Sandbox.kill(message)`

Kill the Native Client child process. See [Node.js documentation](http://nodejs.org/api/child_process.html#child_process_child_kill_signal) for more info.

### `Sandbox.passthroughStdio()`

Pipes the sandbox's `stdout` and `stderr` to the parent process' `stdout` and `stderr`, respectively.

### `Sandbox.getStdout()`

Returns the sandbox's `stdout` stream.

```js
sandbox.getStdout().pipe(process.stdout);
```

### `Sandbox.getStderr()`

Returns the sandbox's `stderr` stream.

```js
sandbox.getStderr().pipe(process.stderr);
```

### `Sandbox.setApi(apiHandler)`

Set the function that will handle the sandbox's API calls


## Messages in/out of the Sandbox

All of the standard Node.js functionality should work inside the Sandbox.

The following describes how to define a new API and allow the sandboxed code to communicate with it.

From inside the sandbox:
```js
var codius = process.binding('async');
var message = {
  type: 'api',
  api: 'fs',
  method: 'readFile',
  data: [ 'sandbox.js' ]
};

codius.postMessage(JSON.stringify(message), function(error, result){
  // handle error and result
});
```

All messages whose type is `api` will be passed through to the `apiHandler` function supplied to the Sandbox when it is instantiated (see above).

