"use strict";

const cp = require("child_process");

const Verda = require("./verda");
const Plugin = require("../plugin");
const messages = require("../messages");
const path = require("path");
const os = require("os");
const memorySize = Math.round(os.totalmem() / 1048576);

function flatten(args) {
	let ans = [];
	for (let x of args) {
		if (x == null) continue;
		else if (Array.isArray(x)) ans = [...ans, ...flatten(x)];
		else ans.push(x);
	}
	return ans;
}

function escapeArgv(a) {
	if (!/[ "]/.test(a)) return a;
	return a.replace(/[ "\\]/g, "\\$&");
}

function startVCallPromise(modulePath, args, options) {
	return new Promise(function(resolve, reject) {
		let retval = null;
		let proc = cp.spawn(
			process.argv[0],
			["--max-old-space-size=" + memorySize, path.join(__dirname, "verda-call-process.js")],
			Object.assign({}, options, {
				stdio: ["pipe", "pipe", "pipe", "ipc"]
			})
		);
		proc.on("message", function(message) {
			if (!message.directive) {
				reject(new Error("IPC Error " + message));
			}
			switch (message.directive) {
				case "ready":
					proc.send({ directive: "load", path: modulePath });
					break;
				case "loaded":
					proc.send({ directive: "call", args: args });
					break;
				case "return":
					retval = message.result;
					proc.send({ directive: "over" });
					break;
				case "error":
					console.error("<IPC Error>", message.reason);
					break;
				case "callError":
					console.error(messages.FAILURE, message.message || message.reason);
					break;
				default:
					reject(new Error("<IPC Error> " + message));
					break;
			}
		});
		proc.stdout.on("data", function(data) {
			process.stdout.write(data);
		});
		proc.stderr.on("data", function(data) {
			process.stderr.write(data);
		});
		proc.on("exit", code => {
			if (!code) resolve(retval);
			else reject(new Error("VerdaCall failure when calling " + modulePath));
		});
	});
}

function fillWindow(s, l) {
	if (s.length < l) {
		while (s.length < l) s += " ";
		return s;
	}
	if (s.length <= l) return s;
	if (l > 6) {
		return s.slice(0, l - 3) + "...";
	} else if (l > 0) {
		return s.slice(0, l);
	} else {
		return "";
	}
}

class VCall extends Plugin {
	constructor() {
		super();
	}
	logVCallMessage(context, module, args) {
		context.message(
			...messages.stretMessage(
				[{ raw: "Call", style: messages.kind }, { raw: module, style: messages.highlight }],
				JSON.stringify(args),
				[context.target ? { raw: "→ " + context.target, style: messages.objective } : ""]
			)
		);
	}
	load(context, targeted) {
		const plugin = this;
		if (!context.resources.verda) Verda.singleton.load(context, targeted);

		context.verdaCall = async function(module, args, options) {
			const modulePath = path.resolve(process.cwd(), module);
			plugin.logVCallMessage(context, module, args);
			return await context.resources.verda.mutex(function() {
				return startVCallPromise(modulePath, args, options);
			});
		};
		context.call = function(module, ...args) {
			return context.verdaCall(module, args, {});
		};

		context.cd = Verda.CD(context, context.cd, dir => ({
			call(cmd, ...args) {
				return context.verdaCall(module, args, { cwd: dir });
			}
		}));
	}
}

VCall.singleton = new VCall();

module.exports = VCall;
