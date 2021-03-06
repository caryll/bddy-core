"use strict";

const util = require("util");
let state = { fn: null, ret: null };

process.on("message", function(message) {
	if (!message.directive) {
		process.send({ directive: "error", reason: "Message directive not found." });
		process.exit(1);
	}
	switch (message.directive) {
		case "load":
			state.fn = require(message.path);
			process.send({ directive: "loaded" });
			break;
		case "call":
			if (!state.fn) {
				process.send({ directive: "error", reason: "Function not loaded." });
				process.exit(1);
			}
			let ret = null;
			try {
				ret = state.fn.apply(null, message.args);
			} catch (e) {
				process.send({ directive: "callError", reason: e, message: util.inspect(e) });
				process.exit(1);
			}
			if (ret instanceof Promise) {
				ret.then(result => process.send({ directive: "return", result })).catch(e => {
					process.send({ directive: "callError", reason: e, message: util.inspect(e) });
					process.exit(1);
				});
			} else {
				process.send({ directive: "return", result: ret });
			}
			break;
		case "over":
			process.exit(0);
			break;
		default:
			process.send({ directive: "error", reason: "Message directive not recognized." });
			break;
	}
});

setTimeout(() => process.send({ directive: "ready" }), 0);
