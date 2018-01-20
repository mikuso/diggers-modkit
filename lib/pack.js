const fs = require('fs-extra-promise');
const meta = require('./meta');
const path = require('path');
const propack = require('./propack');
const BufferBuilder = require('buffer-builder');
const BufferReader = require('buffer-reader');
const xmlParse = require('util').promisify(require('xml2js').parseString);

async function bmp2bin({srcBuff, width, height, palette, interlaced, compression, destPath}) {
	let srcBitmap = new BufferReader(srcBuff);
	let magicNumber = srcBitmap.nextString(2);
	if (["BM","BA","CI","CP","IC","PT"].indexOf(magicNumber) === -1) {
		throw Error("Not a bitmap");
	}
	let bmp = {size: srcBitmap.nextUInt32LE()};
	if (bmp.size !== srcBuff.length) {
		throw Error("Bitmap size does not match buffer size");
	}
	srcBitmap.move(4);
	bmp.pixelsOffset = srcBitmap.nextUInt32LE();
	bmp.headerSize = srcBitmap.nextUInt32LE();
	if ([12,40].indexOf(bmp.headerSize) === -1) {
		throw Error("Bitmap format not supported. Must be BITMAPINFOHEADER or BITMAPCOREHEADER");
	}
	if (bmp.headerSize === 12) {
		bmp.width = srcBitmap.nextUInt16LE();
		bmp.height = srcBitmap.nextUInt16LE();
		bmp.colourPlanes = srcBitmap.nextUInt16LE();
		bmp.bpp = srcBitmap.nextUInt16LE();
	} else if (bmp.headerSize === 40) {
		bmp.width = srcBitmap.nextInt32LE();
		bmp.height = srcBitmap.nextInt32LE();
		bmp.colourPlanes = srcBitmap.nextUInt16LE();
		bmp.bpp = srcBitmap.nextUInt16LE();
		bmp.compression = srcBitmap.nextUInt32LE();
	}
	if (bmp.width !== width) {
		throw Error("Image width mismatch");
	}
	if (bmp.height !== height) {
		throw Error("Image height mismatch");
	}
	if (bmp.bpp !== 8) {
		throw Error("Only 8bpp bitmaps supported. Found: "+bmp.bpp);
	}
	if (bmp.compression !== undefined && bmp.compression !== 0) {
		throw Error("Only uncompressed bitmaps supported");
	}
	srcBitmap.seek(14 + bmp.headerSize);
	let srcPalette = srcBitmap.nextBuffer(256 * 3);
	srcBitmap.seek(bmp.pixelsOffset);
	let srcPixels = srcBitmap.nextBuffer(width * height);


	let binBuilder = new BufferBuilder((palette === false ? 0 : (256*3)) + (width * height));
	if (palette === true) {
		for (let i = 0; i < 256; i++) {
			binBuilder.appendUInt8(srcPalette[(i*3)+2] / 4);
			binBuilder.appendUInt8(srcPalette[(i*3)+1] / 4);
			binBuilder.appendUInt8(srcPalette[(i*3)+0] / 4);
		}
	}

	let pixelBuff = Buffer.allocUnsafe(srcPixels.length);
	for (let row = height - 1; row >= 0 ; row--) {
		srcPixels.copy(pixelBuff, ((height-row)-1) * width, row * width, (row * width) + width);
	}

	if (interlaced) {
		let interlacedPixels = pixelBuff;
		pixelBuff = Buffer.allocUnsafe(srcPixels.length);

		for (let i = 0; i < interlacedPixels.length; i++) {
			let offset = i * 4;
			while (offset >= width*height) {
				offset -= (width*height)-1;
			}
			pixelBuff[i] = interlacedPixels[offset];
		}
	}

	binBuilder.appendBuffer(pixelBuff);
	let binBuff = binBuilder.get();

	if (compression === 'RNC') {
		binBuff = await propack.packBuffer(binBuff);
	}

	await fs.outputFileAsync(destPath, binBuff);
}

async function pack(gamePath) {
	let gameName = 'diggers';
	if (await fs.existsAsync(path.resolve(gamePath, 'XTRACTOR.EXE'))) {
		gameName = 'extractors';
	}

	let modPath = path.resolve(gamePath, 'MOD');

	let metaLvlData = await meta.load(gameName+'-lvl_data');
	for (let file of metaLvlData.files) {
		file.srcPath = path.resolve(modPath, 'LVL_DATA', [file.name, file.tileset, file.title].join('-')  + '.tmx');
		file.exists = await fs.existsAsync(file.srcPath);
		if (!file.exists) {
			continue;
		}

		file.destPath = path.resolve(gamePath, metaLvlData.path, file.name);
		console.log('Packing', file.srcPath, 'to', file.name);

		let xml = await xmlParse(await fs.readFileAsync(file.srcPath, 'utf8'));
		let csv;
		try {
			csv = xml.map.layer[0].data[0]._.split(',').map(x => x.trim()).filter(x=>x !== '').map(x => +x);
		} catch (err) {
			throw Error("Tilemap layer not found");
		}

		let mapBuilder = new BufferBuilder(128*128*2);
		for (let i of csv) {
			mapBuilder.appendInt16BE(i - 1);
		}

		await fs.outputFileAsync(file.destPath, mapBuilder.get());
	}

	let metaGfx = await meta.load(gameName+'-gfx');
	for (let file of metaGfx.files) {
		file.srcPath = path.resolve(modPath, 'GFX', path.parse(file.name).name + '.bmp');
		file.exists = await fs.existsAsync(file.srcPath);

		if (file.bitmask || !file.width || !file.palette || !file.exists) {
			continue;
		}

		file.srcBuff = await fs.readFileAsync(file.srcPath, null);
		file.destPath = path.resolve(gamePath, metaGfx.path, file.name);

		console.log('Packing', file.srcPath, 'to', file.name);
		await bmp2bin(file);
	}
}

module.exports = pack;
