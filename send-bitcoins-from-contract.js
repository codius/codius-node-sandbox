var Bitcoin = require('bitcoinjs-lib');
var http = require('http');
var request = require('request');
var concat = require('concat-stream');
var async = require('async');
var JSONStream = require('JSONStream');

var config = require('./config');

var contract_instances = config.contract_instances;

var pubkeys = contract_instances.map(function(instance){
	return new Buffer(instance.pubkey, 'hex');
});
var contract_hosts = contract_instances.map(function(instance){
	return instance.host;
});

var contract_address = config.contract_address;

var script = createTwoOfThreeMultisig(pubkeys);

var FEE = 20000;

var args = process.argv.slice();
if (args.length > 4) {
	var command_index = (args.indexOf('bin/codius-run'));
	args = args.slice(command_index);
}
if (args.length === 4) {
	sendPayment(args[2], contract_address, parseInt(args[3]));
}

function sendPayment(pay_to_address, contract_address, amount) {
	buildTransaction(pay_to_address, contract_address, amount, function(error, result){
		if (error) {
			console.log(error);
			return;
		}

		multisigSignTransaction(result, contract_hosts, function(error, result){
			submitTx(result);
		});
	});
}

function multisigSignTransaction(tx, contract_hosts, callback) {
	async.map(contract_hosts, function(host, async_callback){
		getSignature(host, tx, script, async_callback);
	}, function(err, signatures){
		tx = assembleMultisigTransaction(tx, signatures);
		callback(null, tx);
	});
}

function assembleMultisigTransaction(tx, signatures) {
	var tx_builder = Bitcoin.TransactionBuilder.fromTransaction(tx);
	tx_builder.signatures[0] = {
		pubkeys: pubkeys,
		hashType: Bitcoin.Transaction.SIGHASH_ALL,
		redeemScript: Bitcoin.Script.fromHex(script),
		signatures: signatures,
		scriptType: 'multisig'
	};

	return tx_builder.build();
}

function buildTransaction(to, from, amount, callback) {
	var tx = new Bitcoin.Transaction();

	var account_balance = 0;

	getUnspentOutputs(from, function(error, outputs){
		outputs.forEach(function(output){
			account_balance += output.value;

			tx.addInput(output.transaction_hash, output.transaction_index);
		});

		if (amount + FEE > account_balance) {
			callback(new Error('Insuffifient balance. Account Balance: ' + account_balance));
			return;
		}

		tx.addOutput(to, amount);
		tx.addOutput(from, account_balance - amount - FEE);

		callback(null, tx);
	});
}

function getUnspentOutputs(address, callback) {
	request('https://api.biteasy.com/blockchain/v1/addresses/' + address + '/unspent-outputs')
	.pipe(JSONStream.parse(['data', 'outputs', '0']))
  .pipe(concat(function(data){
  	console.log('unspent-outputs', data)
  	callback(null, data);
  }));
}


function submitTx(tx) {
	var tx_hex;
	if (tx instanceof Bitcoin.Transaction) {
		tx_hex = tx.toHex();
	} else {
		tx_hex = tx;
	}
	console.log('Submitting Transaction to blockchain.info');

	request.post('https://blockchain.info/pushtx', {
		form: {
			tx: tx_hex
		}
	}, function(err, res, body){
		if (err) {
			console.log(err);
			return;
		}

		if (body === 'Transaction Submitted\n') {
			console.log('Transaction Submitted: https://blockchain.info/tx/' + tx.getId());
		}
	});
} 

function createTwoOfThreeMultisig(pubkeys) {

	var redemption_script = Bitcoin.Script.fromChunks([
		Bitcoin.opcodes.OP_2,
		pubkeys[0],
		pubkeys[2],
		pubkeys[1],
		Bitcoin.opcodes.OP_3,
		Bitcoin.opcodes.OP_CHECKMULTISIG
	]);

	return redemption_script.toHex();
}



function getSignature(host, tx, redeem_script, callback) {
	console.log('Get signature from: ' + host);

	var data = {
		redeem_script: redeem_script,
		transaction: tx.toHex(),
	};

	request.post({
		url: host,
		json: data
	}).pipe(concat(function(response){
		var sig_der = new Buffer(response.toString('utf8'), 'hex');
		// console.log('sig_der', sig_der.toString('hex'));

		// console.log('scriptSignature', Bitcoin.ECSignature.fromDER(sig_der).toScriptSignature(Bitcoin.Transaction.SIGHASH_ALL).toString('hex'))

		callback(null, Bitcoin.ECSignature.fromDER(sig_der));
	}));
}

