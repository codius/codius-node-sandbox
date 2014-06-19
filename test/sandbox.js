//-----------------------------------------------------------------------------
// Init
//-----------------------------------------------------------------------------

var chai      = require('chai');
var expect    = chai.expect;
var sinon     = require('sinon');
var sinonChai = require('sinon-chai');
chai.use(sinonChai);
var Sandbox   = require('../lib/sandbox');

//-----------------------------------------------------------------------------
// Tests
//-----------------------------------------------------------------------------

describe('Sandbox', function() {

  var sb;
  beforeEach(function(){

    // this.timeout =   10000;

    sb = new Sandbox();
    sb.options.timeout = 1000;
  });

  // afterEach(function(){
  //   sb = null;
  // });

  it('should execute basic javascript', function(done) {
    sb.run('1 + 1', function(err, result) {
      expect(err).not.to.exist;
      expect(result).to.equal('2');
      done();
    });
  });

  it('should gracefully handle syntax errors', function(done) {
    sb.run('hi )there', function(err, result) {
      expect(err).to.equal('SyntaxError: Unexpected token )');
      expect(result).not.to.exist;
      done();
    });
  });

  it('should effectively prevent code from accessing node', function(done) {
    sb.run('process.platform', function(err, result) {
      expect(err).not.to.exist;
      expect(result).to.equal('null');   
      done();
    });
  });

  it.only('should effectively prevent code from circumventing the sandbox', function(done) {
    sb.run("var sys=require('sys'); sys.puts('Up in your fridge')", function(err, result) {
      expect(err).to.equal('ReferenceError: require is not defined');
      expect(result).not.to.exist;
      done();
    });
  });

  it('should timeout on infinite loops', function(done) {
    sb.run('while ( true ) {}', function(err, result) {
      expect(err).to.equal('TimeoutError');
      expect(result).not.to.exist;
      done();
    });
  });

  it('should allow console output via `console.log`', function(done) {
    var stdout_write = sinon.spy();
    sb._stdout = { write: stdout_write };
    
    sb.run('console.log(7); 42', function(err, result) {
      expect(err).not.to.exist;
      expect(result).to.equal('42');
      expect(stdout_write).to.be.calledOnce;
      expect(stdout_write).to.be.calledWith('7');
      done();
    });
  });

  it('should allow console output via `print`', function(done) {
    var stdout_write = sinon.spy();
    sb._stdout = { write: stdout_write };

    sb.run('print(7); 42', function(err, result) {
      expect(err).not.to.exist;
      expect(result).to.equal('42');
      expect(stdout_write).to.be.calledWithExactly(7);
      done();
    });
  });

  it('should maintain the order of sync. console output', function(done) {
    var stdout_write = sinon.spy();
    sb._stdout = { write: stdout_write };

    sb.run('console.log("first"); console.log("second"); 42', function(err, result) {
      expect(err).not.to.exist;
      expect(result).to.equal('42');
      expect(stdout_write).on.firstCall.to.be.calledWith('first');
      expect(stdout_write).on.secondCall.to.be.calledWith('second');
      done();
    });
  });

  it('should expose the postMessage command to the sandboxed code', function(done){
    var messageHandler = sinon.spy();
    sb.on('message', messageHandler);
    sb.run('postMessage("Hello World!");', function(output){
      expect(messageHandler).to.be.calledOnce;
      expect(messageHandler).to.be.calledWith('Hello World!');
      done();
    });
  });

  it('should allow sandboxed code to receive messages sent by postMessage from the outside by overwriting the onmessage function', function(done){
    var messageHandler = sinon.spy();
    sb.on('message', messageHandler);
    sb.on('ready', function () {
      sb.postMessage('Hello World!');
    });
    sb.run('onmessage = function (msg) { postMessage(msg); };', function(err, result) {
      expect(messageHandler).to.be.calledOnce;
      expect(messageHandler).to.be.calledWith('Hello World!');
      done();
    });
  });
  
  it('should queue messages posted before the sandbox is ready and process them once it is', function(done){
    var messageHandler = sinon.spy();
    var num_messages_sent = 0;
    var interval = setInterval(function(){
      sb.postMessage(++num_messages_sent);
    }, 1);
    sb.on('message', messageHandler);
    sb.run('onmessage = function (msg) { postMessage(msg); };', function(err, result) {
      expect(messageHandler).to.have.callCount(num_messages_sent);
      expect(num_messages_sent).to.be.greaterThan(0);
      done();
    });
    sb.on('ready', function(){
      clearInterval(interval);
    });
  });

});