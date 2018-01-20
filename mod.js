const commander = require('commander');
const unpack = require('./lib/unpack');
const pack = require('./lib/pack');

commander
	.option('-u, --unpack <dir>', 'Unpack Mod')
	.option('-p, --pack <dir>', 'Pack Mod')
	.parse(process.argv);

if (commander.unpack) {
	unpack(commander.unpack);
} else if (commander.pack) {
	pack(commander.pack);
} else {
	commander.outputHelp();
}