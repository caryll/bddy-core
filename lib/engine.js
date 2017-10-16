"use strict";

const colors = require("colors/safe");
const messages = require("./messages");
const errors = require("./errors");
const fs = require("fs-extra");
const { Target } = require("./target");

const PROBING = Symbol("probing");
const STARTED = Symbol("pending");
const COMPLETE = Symbol("complete");

class Recipe {
	constructor(cotarget, howtodo, ignoreError) {
		this.cotarget = cotarget;
		this.howtodo = howtodo;
	}
	async run(ctx, item) {
		try {
			await this.howtodo.call(ctx, item, ctx, this.cotarget);
		} catch (e) {
			if (!e.bddyIgnorable) {
				throw e;
			}
		}
	}
}

class Task {
	constructor(recipes, ctx, target) {
		this.target = target;
		this.state = PROBING;
		this.time = new Date();
		this.promise = this.findRecipe(recipes)
			.then(recipe => {
				const ctx1 = ctx.ctxTargeting(target);
				return this.start(recipe, ctx1, target);
			})
			.then(target.getUpdateTime.bind(target))
			.then(t => {
				ctx.__fulfill(target, t || new Date());
				return Promise.resolve(target);
			});
	}
	async findRecipe(recipes) {
		for (let j = recipes.length - 1; j >= 0; j--) {
			const recipe = recipes[j];
			if (await recipe.cotarget.match(this.target)) {
				this.state = STARTED;
				return recipe;
			}
		}
		throw new errors.CannotFindRecipe(this.target);
	}
	start(recipe, ctx, target) {
		return recipe.run(ctx, target);
	}
}

class Definitions {
	constructor() {
		this.recipes = [];
	}
	def(cotarget, f) {
		this.recipes.push(new Recipe(cotarget, f));
		return this;
	}
	// An async function that returns a promise
	run(target, ctx) {
		// already started?
		const targetid = target.toIdentifier();
		if (ctx.tasks.has(targetid)) {
			const task = ctx.tasks.get(targetid);
			if (task.state !== COMPLETE) {
				return task.promise.then(Promise.resolve(target));
			} else {
				return Promise.resolve(target);
			}
		} else {
			const task = new Task(this.recipes, ctx, target);
			ctx.tasks.set(targetid, task);
			return task.promise.then(Promise.resolve(target));
		}
	}
}

class Context {
	constructor() {
		this.definitions = new Definitions();
		this.chain = new Set();
		this.tasks = new Map();
		this.resources = {};
		this.plugins = {};
	}
	loadDefinitions(F) {
		F.call(this.definitions, this.definitions);
		return this;
	}
	def(cotarget, f) {
		this.definitions.def(cotarget, f);
		return this;
	}
	__fulfill(target, time) {
		const targetid = target.toIdentifier();
		if (this.tasks.has(targetid) && this.tasks.get(targetid).state === COMPLETE) return;
		const task = this.tasks.get(targetid);
		task.state = COMPLETE;
		task.time = time || new Date();
	}
	ctxTargeting(target) {
		return new TargetContext(this, target);
	}
	async toTarget(t) {
		if (t instanceof Target) return t;
		const defs = this.definitions;
		for (let j = defs.recipes.length - 1; j >= 0; j--) {
			let t1 = await defs.recipes[j].cotarget.createTargetFromString("" + t);
			if (t1 instanceof Target) return t1;
		}
		throw new errors.CannotFindRecipe(t);
	}
	async wish(t) {
		let target = await this.toTarget(t);
		await this.definitions.run(target, this);
		return this;
	}
	loadPlugin(ps) {
		for (let pid in ps) {
			this.plugins[pid] = ps[pid];
			ps[pid].load(this, false);
		}
		return this;
	}
	message(...text) {
		console.error(messages.DIAMOND, ...text);
	}
	log(...text) {
		console.error(messages.LOG, ...text.map(s => colors.gray("" + s)));
	}
}

function flatPreq(p) {
	let a = [];
	for (let x of p) {
		if (!x) continue;
		if (Array.isArray(x)) a = a.concat([...x]);
		else a.push(x);
	}
	return a;
}

class TargetContext extends Context {
	constructor(parent, target) {
		super();
		this.definitions = parent.definitions;
		this.target = target;
		this.tasks = parent.tasks;
		this.chain = new Set(parent.chain);
		this.chain.add(target.toIdentifier());
		this.resources = Object.create(parent.resources);
		this.plugins = Object.create(parent.plugins);
		// inherit plugins
		for (let pid in this.plugins) {
			const plugin = this.plugins[pid];
			plugin.load(this, true);
		}
	}
	def() {
		throw new Error("Cannot define recipes in target-specific contexts.");
	}
	fulfill(time) {
		return super.__fulfill(this.target, time);
	}
	fail(why) {
		throw new errors.BuildFailure(this.target, why);
	}
	async _check(..._prerequisites) {
		let tasks = [];
		let prerequisites = _prerequisites.map(p => p.asPrerequisite(this.target));
		for (let p of prerequisites) {
			if (this.chain.has(p.toIdentifier())) throw new errors.Circular(p);
			tasks.push(this.definitions.run(p, this));
		}
		await Promise.all(tasks);

		let needUpdate = false;
		let latest = null;
		for (let p of prerequisites) {
			let status = this.tasks.get(p.toIdentifier());
			if (!status || status.state !== COMPLETE) throw new errors.Incomplete(p);
			needUpdate = needUpdate || (await this.target.needUpdate(status.time));
			latest = !latest || status.time > latest ? status.time : latest;
		}
		return { needUpdate, latest };
	}
	async wish(t) {
		return await this.check(t);
	}
	async check(...p) {
		let prerequisites = await Promise.all(flatPreq(p).map(this.toTarget.bind(this)));
		let { needUpdate } = await this._check(...prerequisites);
		prerequisites.needUpdate = needUpdate;
		return prerequisites;
	}
	async need(...p) {
		let prerequisites = await Promise.all(flatPreq(p).map(this.toTarget.bind(this)));
		let { needUpdate, latest } = await this._check(...prerequisites);
		if (!needUpdate) {
			this.__fulfill(this.target, await this.target.getUpdateTime(latest));
			throw new errors.NothingToDo();
		}
		return prerequisites;
	}
}

exports.Context = Context;
