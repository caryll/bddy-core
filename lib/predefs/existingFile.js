"use strict";

const { ExistsFile, AnyDir } = require("../targets/file");
const fs = require("fs-extra");
const messages = require("../messages");

module.exports = function(defs) {
	defs.def(new ExistsFile(), async function(target) {
		this.fulfill(await target.getUpdateTime());
	});
	defs.def(new AnyDir(), async function(target) {
		if (!await fs.exists("" + target)) {
			this.message(messages.kind("Make Directory"), "" + target);
		}
		await fs.ensureDir("" + target);
	});
};
