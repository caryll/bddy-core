"use strict";

const Plugin = require("../plugin");
const Verda = require("./verda");
const fs = require("fs-extra");

class FileOps extends Plugin {
	constructor() {
		super();
	}
	load(context, targeted) {
		if (!context.resources.verda) Verda.singleton.load(context, targeted);
		context.existsFile = async function(target) {
			return await fs.pathExists("" + target);
		};
		context.rm = async function(...targets) {
			for (let t of targets) {
				let pt = "" + t;
				if (await fs.pathExists(pt)) {
					await fs.remove(pt);
				}
			}
		};
		context.cp = async function(from, to) {
			return await fs.copy("" + from, "" + to);
		};
		context.mv = async function(from, to) {
			return await fs.move("" + from, "" + to);
		};
	}
}

module.exports = FileOps;
