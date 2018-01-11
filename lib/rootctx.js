"use strict";
const { Context } = require("./engine");

class RootContext extends Context {
	constructor() {
		super();
		this.wanted = [];
	}
	want(target) {
		this.wanted.push(target);
	}
}

module.exports = RootContext;
