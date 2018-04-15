"use strict";

const cpp = require("child-process-promise");
const path = require("path");
const Verda = require("./verda");
const Plugin = require("../plugin");
const messages = require("../messages");

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

class Command extends Plugin {
	constructor() {
		super();
	}
	logCallMessage(context, cmd, args, options) {
		context.message(
			...messages.stretMessage(
				[{ raw: "Command", style: messages.kind }, { raw: cmd, style: messages.highlight }],
				args.map(x => "" + x).join(" "),
				[
					options && options.cwd
						? { raw: "in " + options.cwd, style: messages.kind }
						: "",
					context.target ? { raw: "→ " + context.target, style: messages.objective } : ""
				]
			)
		);
	}
	load(context, targeted) {
		const plugin = this;
		if (!context.resources.verda) Verda.singleton.load(context, targeted);
		context.command = async function(cmd, args, options, interactive) {
			const t = this;
			[cmd, ...args] = [...flatten([cmd]), ...flatten(args)];
			return await context.resources.verda.mutex(function() {
				plugin.logCallMessage(context, path.basename(cmd), args, options);
				let prom = cpp.spawn(cmd, args, options);
				let proc = prom.childProcess;
				if (!interactive) {
					proc.stdout.on("data", function(data) {
						process.stdout.write(data);
					});
					proc.stderr.on("data", function(data) {
						process.stderr.write(data);
					});
				}
				return prom;
			});
		};

		context.run = function(cmd, ...args) {
			return this.command(cmd, args);
		};
		context.runInteractive = function(cmd, ...args) {
			return context.command(cmd, args, { stdio: "inherit" }, true);
		};

		context.cd = Verda.CD(context, context.cd, dir => ({
			run(cmd, ...args) {
				return context.command(cmd, args, { cwd: dir });
			},
			runInteractive(cmd, ...args) {
				return context.command(cmd, args, { cwd: dir, stdio: "inherit" }, true);
			}
		}));
	}
}

Command.singleton = new Command();

module.exports = Command;
