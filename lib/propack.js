const path = require('path');
const fs = require('fs-extra-promise');
const tmp = require('tmp-promise');
const execa = require('execa');

const derncExe = path.resolve(__dirname, '../bin/dernc.exe');
const rncExe = path.resolve(__dirname, '../bin/rnc_lib.exe');

async function unpackFile(srcPath, destPath) {
	await fs.ensureDirAsync(path.dirname(destPath));
	await execa(derncExe, [
		'-o',
		srcPath,
		destPath
	]);
	return await fs.existsAsync(destPath);
}

async function packFile(srcPath, destPath) {
	await fs.ensureDirAsync(path.dirname(destPath));
	await execa(rncExe, [
		'p',
		srcPath,
		destPath
	]);
	return await fs.existsAsync(destPath);
}

async function packBuffer(srcBuffer) {
	let srcTemp = await tmp.file({postfix: '.bin', prefix: 'diggers-'});
	let destTemp = await tmp.file({postfix: '.bin', prefix: 'diggers-'});

	try {
		await fs.writeFileAsync(srcTemp.path, srcBuffer);
		await packFile(srcTemp.path, destTemp.path);
		return await fs.readFileAsync(destTemp.path, null);
	} catch (err) {
		throw err;
	} finally {
		srcTemp.cleanup();
		destTemp.cleanup();
	}
}

async function unpackBuffer(srcBuffer) {
	if (srcBuffer.toString('ascii', 0, 3) !== 'RNC') {
		throw Error("Buffer not compressed with RNC Pro-Pack");
	}

	let srcTemp = await tmp.file({postfix: '.bin', prefix: 'diggers-'});
	let destTemp = await tmp.file({postfix: '.bin', prefix: 'diggers-'});

	try {
		await fs.writeFileAsync(srcTemp.path, srcBuffer);
		await unpackFile(srcTemp.path, destTemp.path);
		return await fs.readFileAsync(destTemp.path, null);
	} catch (err) {
		throw err;
	} finally {
		srcTemp.cleanup();
		destTemp.cleanup();
	}
}

module.exports = {
	unpackFile,
	unpackBuffer,
	packFile,
	packBuffer
};
