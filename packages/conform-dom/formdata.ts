/**
 * Construct a form data with the submitter value.
 * It utilizes the submitter argument on the FormData constructor from modern browsers
 * with fallback to append the submitter value in case it is not unsupported.
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/API/FormData/FormData#parameters
 */
export function getFormData(
	form: HTMLFormElement,
	submitter?: HTMLInputElement | HTMLButtonElement | null,
): FormData {
	const payload = new FormData(form, submitter);

	if (submitter && submitter.type === 'submit' && submitter.name !== '') {
		const entries = payload.getAll(submitter.name);

		// This assumes the submitter value to be always unique, which should be fine in most cases
		if (!entries.includes(submitter.value)) {
			payload.append(submitter.name, submitter.value);
		}
	}

	return payload;
}

/**
 * Returns the paths from a name based on the JS syntax convention
 * @example
 * ```js
 * const paths = getPaths('todos[0].content'); // ['todos', 0, 'content']
 * ```
 */
export function getPaths(name: string): Array<string | number> {
	if (!name) {
		return [];
	}

	return name
		.split(/\.|(\[\d*\])/)
		.reduce<Array<string | number>>((result, segment) => {
			if (typeof segment !== 'undefined' && segment !== '') {
				if (segment.startsWith('[') && segment.endsWith(']')) {
					const index = segment.slice(1, -1);

					result.push(Number(index));
				} else {
					result.push(segment);
				}
			}
			return result;
		}, []);
}

/**
 * Returns a formatted name from the paths based on the JS syntax convention
 * @example
 * ```js
 * const name = formatPaths(['todos', 0, 'content']); // "todos[0].content"
 * ```
 */
export function formatPaths(paths: Array<string | number>): string {
	return paths.reduce<string>((name, path) => {
		if (typeof path === 'number') {
			return `${name}[${path}]`;
		}

		if (name === '' || path === '') {
			return [name, path].join('');
		}

		return [name, path].join('.');
	}, '');
}

/**
 * Check if a name is a subpath of a parent name
 */
export function isSubpath(name: string, parent: string) {
	const paths = getPaths(name);
	const parentPaths = getPaths(parent);

	return (
		paths.length >= parentPaths.length &&
		parentPaths.every((path, index) => paths[index] === path)
	);
}

/**
 * Assign a value to a target object by following the paths on the name
 */
export function setValue<Value>(
	target: Record<string, any>,
	name: string,
	valueFn: (prev?: unknown) => Value,
): Value {
	const paths = getPaths(name);
	const length = paths.length;
	const lastIndex = length - 1;

	let index = -1;
	let pointer = target;

	while (pointer != null && ++index < length) {
		const key = paths[index] as string | number;
		const nextKey = paths[index + 1];
		const newValue =
			index != lastIndex
				? pointer[key] ?? (typeof nextKey === 'number' ? [] : {})
				: valueFn(pointer[key]);

		pointer[key] = newValue;
		pointer = pointer[key];
	}

	// @ts-expect-error: The pointer should be assigned with the result of the valueFn
	return pointer;
}

/**
 * Check if a value is a plain object
 */
export function isPlainObject(
	obj: unknown,
): obj is Record<string | number | symbol, unknown> {
	return (
		!!obj &&
		obj.constructor === Object &&
		Object.getPrototypeOf(obj) === Object.prototype
	);
}

/**
 * Simplify value by removing empty object or array and null values
 */
export function simplify<Type extends Record<string, unknown>>(
	value: Type,
): Record<string, unknown> | undefined;
export function simplify<Type extends Array<unknown>>(
	value: Type,
): Array<unknown> | undefined;
export function simplify(value: unknown): unknown | undefined;
export function simplify<Type extends Record<string, unknown> | Array<unknown>>(
	value: Type,
): Record<string, unknown> | Array<unknown> | undefined {
	if (isPlainObject(value)) {
		const obj = Object.entries(value).reduce<Record<string, unknown>>(
			(result, [key, value]) => {
				const data = simplify(value);

				if (typeof data !== 'undefined') {
					result[key] = data;
				}

				return result;
			},
			{},
		);

		if (Object.keys(obj).length === 0) {
			return;
		}

		return obj;
	}

	if (Array.isArray(value)) {
		if (value.length === 0) {
			return undefined;
		}

		return value.map(simplify);
	}

	if (value instanceof File || value === null) {
		return;
	}

	return value;
}

/**
 * Flatten a tree into a dictionary
 */
export function flatten(
	data: Record<string | number | symbol, unknown> | Array<unknown> | undefined,
	options?: {
		resolve?: (data: unknown) => unknown | null;
		prefix?: string;
	},
): Record<string, unknown> {
	const result: Record<string, unknown> = {};
	const resolve = options?.resolve ?? ((data) => data);

	function setResult(data: unknown, name: string) {
		const value = simplify(resolve(data));

		if (typeof value !== 'undefined') {
			result[name] = value;
		}
	}

	function processObject(
		obj: Record<string | number | symbol, unknown>,
		prefix: string,
	): void {
		setResult(obj, prefix);

		for (const [key, value] of Object.entries(obj)) {
			const name = prefix ? `${prefix}.${key}` : key;

			if (Array.isArray(value)) {
				processArray(value, name);
			} else if (value && isPlainObject(value)) {
				processObject(value, name);
			} else {
				setResult(value, name);
			}
		}
	}

	function processArray(array: Array<unknown>, prefix: string): void {
		setResult(array, prefix);

		for (let i = 0; i < array.length; i++) {
			const item = array[i];
			const name = `${prefix}[${i}]`;

			if (Array.isArray(item)) {
				processArray(item, name);
			} else if (item && isPlainObject(item)) {
				processObject(item, name);
			} else {
				setResult(item, name);
			}
		}
	}

	if (data) {
		const prefix = options?.prefix ?? '';

		if (Array.isArray(data)) {
			processArray(data, prefix);
		} else {
			processObject(data, prefix);
		}
	}

	return result;
}
