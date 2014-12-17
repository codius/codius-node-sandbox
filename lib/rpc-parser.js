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

var Parser = require('stream-parser');
var inherits = require('util').inherits;
var Transform = require('stream').Transform;

var format = require('./rpc-binary-format');

function RpcParser() {
  Transform.call(this);

  this._bytes(format.HEADER_SIZE, this.onheader); 
}
inherits(RpcParser, Transform);

Parser(RpcParser.prototype);

// invoked when the first 8 bytes have been received
RpcParser.prototype.onheader = function (buffer, output) {
  // parse the "buffer" into a useful "header" object
  var header = {};
  header.magic = buffer.readUInt32LE(0);
  header.callback_id = buffer.readUInt32LE(4);
  header.size = buffer.readUInt32LE(8);
  
  if (header.magic !== format.MAGIC_BYTES) {
    // TODO: don't throw error here
    throw new Error("Magic bytes don't match (received: "+buffer.slice(0, 4).toString('hex')+')');
  }
  this.emit('header', header);

  this._bytes(header.size, this.onbody.bind(this, header.callback_id));
};

RpcParser.prototype.onbody = function (callback_id, buffer) {
  this.emit('message', buffer.toString('utf-8'), callback_id);

  this._bytes(format.HEADER_SIZE, this.onheader); 
};

exports.RpcParser = RpcParser;
