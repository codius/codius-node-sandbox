var http = require('http');
var bitcoin = require('bitcoinjs-lib');
var concat = require('concat-stream');

var config = require('./config.json');
var CONTRACT_PRIVKEY = config.CONTRACT_PRIVKEY;
var port = config.port || 7777;

if (!CONTRACT_PRIVKEY) {
	throw new Error('Must create config.json with a CONTRACT_PRIVKEY to run contract');
}

createServer(port, CONTRACT_PRIVKEY);

function createServer(PORT, CONTRACT_PRIVKEY) {

	var HOST = '0.0.0.0';

	function responseHandler(req, res){
		req.pipe(concat(function(data){

			if (Buffer.isBuffer(data)) {
				data = data.toString('utf8');
			}
			var json = JSON.parse(data);

			var transaction = bitcoin.Transaction.fromHex(json.transaction);
			var redeem_script = bitcoin.Script.fromHex(json.redeem_script);

			console.log('Contract got request to sign transaction with hash: ', transaction.getId() + '\n');

			var key = bitcoin.ECKey.fromWIF(CONTRACT_PRIVKEY);
			
			var transaction_builder = bitcoin.TransactionBuilder.fromTransaction(transaction);

			console.log('...Just a few more seconds... We\'re still experiencing performance issues...\n');

			transaction_builder.sign(0, key, redeem_script);

			var signature = transaction_builder.signatures[0].signatures[0];
			var signature_hex = signature.toDER().toString('hex');

			res.write(signature_hex);
			res.end();

			console.log('Contract computed signature: ' + signature_hex + '\n');
			console.log('Sending signature back to client...');

		}));
	}

	http.createServer(responseHandler).listen(PORT, HOST);

	console.log('Contract listening on port: ' + PORT + '\n');

	console.log('Welcome to the ...');

	console.log('\n  ______                   __  __                               \n /      \\                 |  \\|  \\                              \n|  $$$$$$\\  ______    ____| $$ \\$$ __    __   _______           \n| $$   \\$$ /      \\  /      $$|  \\|  \\  |  \\ /       \\          \n| $$      |  $$$$$$\\|  $$$$$$$| $$| $$  | $$|  $$$$$$$          \n| $$   __ | $$  | $$| $$  | $$| $$| $$  | $$ \\$$    \\           \n| $$__/  \\| $$__/ $$| $$__| $$| $$| $$__/ $$ _\\$$$$$$\\          \n \\$$    $$ \\$$    $$ \\$$    $$| $$ \\$$    $$|       $$          \n  \\$$$$$$   \\$$$$$$   \\$$$$$$$ \\$$  \\$$$$$$  \\$$$$$$$           \n _______   __    __                          __                 \n|       \\ |  \\  |  \\                        |  \\                \n| $$$$$$$\\ \\$$ _| $$_     _______   ______   \\$$ _______        \n| $$__/ $$|  \\|   $$ \\   /       \\ /      \\ |  \\|       \\       \n| $$    $$| $$ \\$$$$$$  |  $$$$$$$|  $$$$$$\\| $$| $$$$$$$\\      \n| $$$$$$$\\| $$  | $$ __ | $$      | $$  | $$| $$| $$  | $$      \n| $$__/ $$| $$  | $$|  \\| $$_____ | $$__/ $$| $$| $$  | $$      \n| $$    $$| $$   \\$$  $$ \\$$     \\ \\$$    $$| $$| $$  | $$      \n \\$$$$$$$  \\$$    \\$$$$   \\$$$$$$$  \\$$$$$$  \\$$ \\$$   \\$$      \n __       __            __  __             __                   \n|  \\  _  |  \\          |  \\|  \\           |  \\                  \n| $$ / \\ | $$  ______  | $$| $$  ______  _| $$_                 \n| $$/  $\\| $$ |      \\ | $$| $$ /      \\|   $$ \\                \n| $$  $$$\\ $$  \\$$$$$$\\| $$| $$|  $$$$$$\\\\$$$$$$                \n| $$ $$\\$$\\$$ /      $$| $$| $$| $$    $$ | $$ __               \n| $$$$  \\$$$$|  $$$$$$$| $$| $$| $$$$$$$$ | $$|  \\              \n| $$$    \\$$$ \\$$    $$| $$| $$ \\$$     \\  \\$$  $$              \n \\$$      \\$$  \\$$$$$$$ \\$$ \\$$  \\$$$$$$$   \\$$$$               \n')
	console.log('\nPlease submit a transaction for signing :)\n');
}