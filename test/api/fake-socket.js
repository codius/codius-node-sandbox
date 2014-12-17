//------------------------------------------------------------------------------
/*
    This file is part of Codius: https://github.com/codius
    Copyright (c) 2014 Ripple Labs Inc.

    Permission to use, copy, modify, and/or distribute this software for any
    purpose  with  or without fee is hereby granted, provided that the above
    copyright notice and this permission notice appear in all copies.

    THE  SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
    WITH  REGARD  TO  THIS  SOFTWARE  INCLUDING  ALL  IMPLIED  WARRANTIES  OF
    MERCHANTABILITY  AND  FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
    ANY  SPECIAL ,  DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
    WHATSOEVER  RESULTING  FROM  LOSS  OF USE, DATA OR PROFITS, WHETHER IN AN
    ACTION  OF  CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
    OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
*/
//==============================================================================

var net = require('net');

var FakeSocket = function (domain, type, protocol) {
  if (domain !== FakeSocket.AF_INET) {
    throw new Error("Unsupported socket domain: "+domain);
  }

  if (type !== FakeSocket.SOCK_STREAM) {
    throw new Error("Unsupported socket type: "+type);
  }
  
  if (protocol !== 0) {
    throw new Error("Unsupported protocol: "+protocol);
  }
  
  this._socket = null;
  this._buffer = [];
  this._sockets_to_accept = [];
  this._eof = false;
}

FakeSocket.AF_INET = 2;

FakeSocket.SOCK_STREAM = 1;

FakeSocket.prototype.connect = function (family, address, port, callback) {
  var self = this;

  if (family != FakeSocket.AF_INET) {
    throw new Error("Unsupported socket family: "+family);
  }
  
  var addressArray = [
    address       & 0xff,
    address >>  8 & 0xff,
    address >> 16 & 0xff,
    address >> 24 & 0xff
  ];
  
  // Convert endianness
  port = (port >> 8 & 0xff) + (port << 8 & 0xffff);
  self._socket = net.createConnection({
    port: port, 
    host: addressArray.join('.')
  });
  self._socket.once('connect', function (e) {
    console.log('FakeSocket connected to ' + addressArray.join('.') + ':' + port);
    callback(null, 0);
  });

  self._socket.on('data', function(data) {
    self._buffer.push(data);
  });
  
  self._socket.on('end', function () {
    self._eof = true;
  });
  
  self._socket.on('error', function(error){
    console.log('socket error: ', error);
  });
};

FakeSocket.prototype.bind = function (family, address, port, callback) {
  var self = this;

  if (family != FakeSocket.AF_INET) {
    throw new Error("Unsupported socket family: "+family);
  }

  var addressArray = [
    address       & 0xff,
    address >>  8 & 0xff,
    address >> 16 & 0xff,
    address >> 24 & 0xff
  ];
  
  // Convert endianness
  port = (port >> 8 & 0xff) + (port << 8 & 0xffff);

  self._socket=net.createServer(function(sock) {
    self._socket.on('error', function(error){
      console.log('socket error: ', error);
    });

    // We have a connection - a socket object will be assigned to the connection with accept()
    self._sockets_to_accept.push(sock);

    // console.log('Fake socket server connected to: ' + sock.remoteAddress +':'+ sock.remotePort);
      
  }).listen(port, addressArray.join('.'));

  callback(null, 0);
};

FakeSocket.prototype.accept = function() {
  var self = this;

  return self._sockets_to_accept.shift();
};

FakeSocket.prototype.read = function (maxBytes, callback) {
  var self = this;
  
  if (!self._buffer.length && this._eof) {
    // UV_EOF (end of file)
    callback(null, -4095);
    return;
  } else if (!self._buffer.length) {
    // EAGAIN (no data, try again later)
    callback(null, -11);
    return;
  }
  
  var buffer = self._buffer.shift();
  if (buffer.length > maxBytes) {
    self._buffer.unshift(buffer.slice(maxBytes));
    buffer = buffer.slice(0, maxBytes);
  }

  callback(null, buffer.toString('hex'));
};

FakeSocket.prototype.write = function (stringToWrite, callback) {
  var self = this;

  self._socket.write(stringToWrite);
  callback(null);
}

FakeSocket.prototype.close = function (callback) {
  var self = this;
  
  self._socket.destroy();
  callback(null);
}

exports.FakeSocket = FakeSocket;

