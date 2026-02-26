import * as net from "net";

let server = net.createServer({ pauseOnConnect: true });
server.listen({ host: "127.0.0.1", port: 1234 });
server.on("connection", newCon);
server.on("error", (err: Error) => {
	throw err;
});

async function newCon(socket: net.Socket) {
	console.log("new connection", socket.remoteAddress, socket.remotePort);
	try {
		await serveClient(socket);
	} catch (error) {
		console.error("error: ", error);
	} finally {
		socket.destroy();
	}
}

async function serveClient(socket: net.Socket) {
	const conn: TCPConn = soInit(socket);
	while (true) {
		const data = await soRead(conn);
		if (data.length === 0) {
			// EOF
			console.log("end connection");
			break;
		}

		console.log("data: ", data);

		// echo back the data
		await soWrite(conn, data);
	}
}

// A promise-based API for TCP sockets.
type TCPConn = {
	// the js socked object
	socket: net.Socket;
	// error event
	err: null | Error;
	// EOF, from the end event
	ended: boolean;
	// callbacks of the promise of the current read
	reader: null | {
		resolve: (value: Buffer) => void;
		reject: (reason: Error) => void;
	};
};

// create wrapper from net.Socket to TCPConn
function soInit(socket: net.Socket): TCPConn {
	const conn: TCPConn = {
		socket: socket,
		err: null,
		ended: false,
		reader: null,
	};

	socket.on("data", (data: Buffer) => {
		console.assert(conn.reader !== null, "unexpected data");
		// pause the data event until the current read is resolved.
		conn.socket.pause();
		// resolve the promise of the current read.
		conn.reader!.resolve(data);
		conn.reader = null;
	});

	socket.on("error", (err: Error) => {
		// errors are also delivered via the promise of the current read.
		conn.err = err;
		if (conn.reader) {
			conn.reader.reject(err);
			conn.reader = null;
		}
	});

	socket.on("end", () => {
		// fulfils the current read
		conn.ended = true;
		if (conn.reader) {
			conn.reader.resolve(Buffer.from("")); // EOF is represented by an empty buffer.
			conn.reader = null;
		}
	});

	return conn;
}

// return an empty buffer after EOF
function soRead(conn: TCPConn): Promise<Buffer> {
	console.assert(conn.reader === null, "already reading"); // only one read at a time.no concurrent reads.
	return new Promise((resolve, reject) => {
		if (conn.err) {
			reject(conn.err);
			return;
		}

		if (conn.ended) {
			resolve(Buffer.from("")); // EOF
			return;
		}

		// save the promise callbacks
		conn.reader = { resolve, reject };
		// resume the data event to receive data.
		conn.socket.resume();
	});
}

function soWrite(conn: TCPConn, data: Buffer): Promise<void> {
	console.assert(data.length > 0, "empty data"); // empty data is not allowed.

	return new Promise((resolve, reject) => {
		if (conn.err) {
			reject(conn.err);
			return;
		}

		conn.socket.write(data, (err) => {
			if (err) {
				reject(err);
			} else {
				resolve();
			}
		});
	});
}
