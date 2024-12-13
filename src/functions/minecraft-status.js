import net from 'node:net';
import { PromiseSocket } from 'promise-socket';

//const hostname = "cloud-mc.westeurope.azurecontainer.io";

/**
 * Returns a JSON string containing info about the minecraft server running at hostname:port
 */
export async function getStatus(hostname, port) {
    // connect
    const socket = new PromiseSocket(new net.Socket());
    socket.setTimeout(10000);
    await socket.connect({ port: port, host: hostname });

    // write handshake
    await writePackage(socket, createHandshake(hostname, port));
    // write status request
    await writePackage(socket, new Uint8Array([0]));
    // read status response
    let status = await readStatusResponse(socket);
    // close connection
    await socket.end();

    return status;
}

function packVarint(num) {
    let buf = [];
    let currentData = num;

    while (true) {
        let byte = (currentData & 0x7f);
        currentData >>= 7;

        if (currentData > 0) {
            buf.push(byte | 0x80);
        } else {
            buf.push(byte);
            break;
        }
    }

    return new Uint8Array(buf);
}

async function readVarint(socket) {
    let data = 0;

    for (let i = 0; i < 5; i++) {
        let buf = await socket.read(1);

        // Least significant 7 bits get prepended to the integer
        data |= (buf[0] & 0x7f) << (7 * i);

        // Most significant bit defines if we keep going
        if ((buf[0] & 0x80) == 0) {
            break;
        }
    }

    return data;
}

async function writePackage(socket, buffer) {
    let len = packVarint(buffer.byteLength);

    await socket.write(len);
    await socket.write(buffer);
}

function createHandshake(host, port) {
    let hostBuf = new TextEncoder('utf-8').encode(host);
    let array = [0, 0];
    array = array.concat(...packVarint(hostBuf.byteLength).values());
    array = array.concat(...hostBuf.values());
    array = array.concat([port & 0x00ff, (port & 0xff00) >> 8]);
    array.push(1);

    return new Uint8Array(array);
}

async function readStatusResponse(socket) {
    const _length = await readVarint(socket);
    const _id = await readVarint(socket);
    const extraLength = await readVarint(socket);

    const buf = await socket.read(extraLength);
    return new TextDecoder().decode(buf);
}

// test code
//(async () => {
//    await getStatus(hostname, 25565);
//})();