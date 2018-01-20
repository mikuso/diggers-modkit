const fs = require('fs-extra-promise');
const meta = require('./meta');
const propack = require('./propack');
const path = require('path');
const BufferBuilder = require('buffer-builder');

async function bin2bmp({srcBuffer, destPath, palette, width, height, interlaced}) {
	let srcPalette = palette.srcBuffer.slice(0, 256*3);
	if (srcBuffer === palette.srcBuffer) {
		srcBuffer = srcBuffer.slice(256*3);
	}

	let destPixels = Buffer.allocUnsafe(srcBuffer.length);

	for (let i = 0; i < srcBuffer.length; i++) {
		let offset = i;
		if (interlaced) {
			offset = (i * 4);
			while (offset >= width*height) {
				offset -= (width*height)-1;
			}
		}
		destPixels[offset] = srcBuffer[i];
	}

	let destPalette = Buffer.allocUnsafe(srcPalette.length);
	for (let i = 0; i < 256; i++) {
		let offset = i*3;
		destPalette.writeUInt8(Math.min(srcPalette.readUInt8(offset) * 4, 255), offset+2); // red -> blue
		destPalette.writeUInt8(Math.min(srcPalette.readUInt8(offset+1) * 4, 255), offset+1); // green -> green
		destPalette.writeUInt8(Math.min(srcPalette.readUInt8(offset+2) * 4, 255), offset); // blue -> red
	}

	let bmpSize = 14 + 12 + srcPalette.length + (width * height);
	let bmpBuilder = new BufferBuilder(bmpSize);
	bmpBuilder.appendString('BM', 'ascii'); // magic number
	bmpBuilder.appendUInt32LE(bmpSize); // bitmap size
	bmpBuilder.appendUInt16LE(0); // reserved
	bmpBuilder.appendUInt16LE(0); // reserved
	bmpBuilder.appendUInt32LE(14 + 12 + srcPalette.length); // pixel data offset
	// BITMAPCOREHEADER
	bmpBuilder.appendUInt32LE(12); // size of header
	bmpBuilder.appendUInt16LE(width); // width
	bmpBuilder.appendUInt16LE(height); // height
	bmpBuilder.appendUInt16LE(1); // colour planes
	bmpBuilder.appendUInt16LE(8); // bits per pixel
	bmpBuilder.appendBuffer(destPalette);
	for (let row = height - 1; row >= 0; row--) {
		let offset = row * width;
		bmpBuilder.appendBuffer(destPixels.slice(offset, offset + width));
	}

	return await fs.writeFileAsync(destPath, bmpBuilder.get());
}

async function unpack(gamePath) {
	let gameName = 'diggers';
	if (await fs.existsAsync(path.resolve(gamePath, 'XTRACTOR.EXE'))) {
		gameName = 'extractors';
	}

	let modPath = path.resolve(gamePath, 'MOD');

	let metaLvlData = await meta.load(gameName+'-lvl_data');
	for (let file of metaLvlData.files) {
		file.srcPath = path.resolve(gamePath, metaLvlData.path, file.name);
		file.exists = await fs.existsAsync(file.srcPath);
		if (!file.exists) {
			continue;
		}

		file.destPath = path.resolve(modPath, 'LVL_DATA', [file.name, file.tileset, file.title].join('-')  + '.tmx');
		console.log('Unpacking', file.name, 'to', file.destPath);

		let buff = await fs.readFileAsync(file.srcPath, null);
		let csv = [];
		for (let i = 0; i < buff.length; i += 2) {
			csv.push(buff.readInt16BE(i) + 1);
		}
		csv = csv.join(',');

		let tmx = `<?xml version="1.0" encoding="UTF-8"?>
			<map version="1.0" tiledversion="1.1.1" orientation="orthogonal" renderorder="right-down" width="128" height="128" tilewidth="16" tileheight="16" infinite="0" nextobjectid="1">
			<tileset firstgid="1" name="${file.tileset}BLOCK1" tilewidth="16" tileheight="16" tilecount="240" columns="20"><image source="../GFX/${file.tileset}BLOCK1.bmp" width="320" height="200"/></tileset>
			<tileset firstgid="241" name="${file.tileset}BLOCK2" tilewidth="16" tileheight="16" tilecount="240" columns="20"><image source="../GFX/${file.tileset}BLOCK2.bmp" width="320" height="200"/></tileset>
			<layer name="Tile Layer 1" width="128" height="128"><data encoding="csv">${csv}</data></layer></map>`;

		await fs.outputFileAsync(file.destPath, tmx);
	}

	let metaGfx = await meta.load(gameName+'-gfx');
	for (let file of metaGfx.files) {
		file.srcPath = path.resolve(gamePath, metaGfx.path, file.name);
		file.exists = await fs.existsAsync(file.srcPath);
		if (file.bitmask || !file.width || !file.palette || !file.exists) {
			continue;
		}

		file.srcBuffer = await fs.readFileAsync(file.srcPath, null);
		if (file.compression === 'RNC' && file.srcBuffer.toString('ascii', 0, 3) === 'RNC') {
			file.srcBuffer = await propack.unpackBuffer(file.srcBuffer);
		}

		file.destPath = path.resolve(modPath, 'GFX', path.parse(file.name).name + '.bmp');
	}

	for (let file of metaGfx.files) {
		if (file.bitmask || !file.width || !file.palette || !file.exists) {
			continue;
		}

		if (file.palette === true) {
			file.palette = file;
		} else if (typeof file.palette === 'string') {
			file.palette = metaGfx.files.find(f => f.name === file.palette);
			if (!file.palette) {
				throw Error(`Couldn't find palette for ${file.name}`);
			}
		} else {
			throw Error("Cannot unpack an image without a palette");
		}

		console.log('Unpacking', file.name, 'to', file.destPath);
		await bin2bmp(file);
	}
}

module.exports = unpack;
