import * as net from "net";
import { type TCPConn, type TCPListener } from "./TCPListener.js";

main();

async function main() {
	const listener = soListen(8080, "127.0.0.1");

	while (true) {
		try {
			const conn = await soAccept(listener);
			// starts a task to serve the connection; don't await it to accept new connections concurrently.
			serveClient(conn).catch((err) => {
				console.error("error serving client: ", err);
			});
		} catch (error) {
			console.error("error accepting connection: ", error);
			break;
		}
	}
}

function soListen(port: number, host: string): TCPListener {
	const server = net.createServer({ pauseOnConnect: true });

	const listener: TCPListener = {
		server,
		err: null,
		closed: false,
		accepter: null,
	};

	// new Incoming connection
	server.on("connection", (socket: net.Socket) => {
		console.assert(listener.accepter !== null, "connection without pending accept");
		if (!listener.accepter) {
			socket.destroy();
			return;
		}

		const { resolve } = listener.accepter;
		listener.accepter = null;

		// warp the socket into a TCPConn and resolve the accept promise.
		const conn = soInit(socket);
		resolve(conn);
	});

	// server error
	server.on("error", (err) => {
		listener.err = err;
		if (listener.accepter) {
			listener.accepter.reject(err);
			listener.accepter = null;
		}
	});

	// server closed
	server.on("close", () => {
		listener.closed = true;
		if (listener.accepter) {
			listener.accepter.reject(new Error("server closed"));
			listener.accepter = null;
		}
	});

	server.listen({ host, port });

	return listener;
}

function soAccept(listener: TCPListener): Promise<TCPConn> {
	return new Promise((resolve, reject) => {
		// fail fast if the server is already closed or has error.
		if (listener.closed) {
			reject(new Error("server closed"));
			return;
		}

		if (listener.err) {
			reject(listener.err);
			return;
		}

		listener.accepter = { resolve, reject };
	});
}

async function serveClient(conn: TCPConn) {
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
