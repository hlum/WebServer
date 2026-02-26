import net from "net";

export type TCPListener = {
	server: net.Server;
	err: null | Error;
	// from close event
	closed: boolean;
	// pending accept promise callbacks
	accepter: null | {
		resolve: (conn: TCPConn) => void;
		reject: (reason: Error) => void;
	};
};

export type TCPConn = {
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
