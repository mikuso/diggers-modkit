const fs = require('fs-extra-promise');
const path = require('path');

async function load(index) {
	return await fs.readJsonAsync(path.resolve(__dirname, '../meta/', index + '.json'));
}

module.exports = {load};
