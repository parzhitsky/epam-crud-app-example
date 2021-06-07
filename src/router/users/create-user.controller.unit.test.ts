import { CelebrateError, Segments, Joi } from "celebrate";
import type { RequestHandler, Request, Response } from "express";
import type { UserType, UserTypeCreation } from "../../db/models/user";
import UserService from "../../services/user.service";
import createUser from "./create-user.controller";

class UserServiceMock extends UserService {
	async create(props: UserTypeCreation): Promise<UserType> {
		const date = "2021-06-07T19:28:29.517Z";

		return {
			id: "42",
			login: props.login,
			password: props.password,
			age: props.age,
			createdAt: date,
			updatedAt: date,
		};
	}
}

function generateRequestHandlerArgs<
	Body extends Partial<UserTypeCreation>,
>(
	body: Body,
): Parameters<RequestHandler<{}, {}, Body>> & { 2: jest.Mock } {
	const req = {
		method: "POST",
		body,
	} as Request<{}, {}, Body>;

	const res = {} as Response;

	res.status = jest.fn(() => res);
	res.json = jest.fn(() => res);

	const next = jest.fn();

	return [ req, res, next ];
}

function expectToBeCalledOnceWithCelebrateError(next: jest.Mock): CelebrateError {
	expect(next).toHaveBeenCalledTimes(1);
	expect(next).toHaveBeenLastCalledWith(expect.any(CelebrateError));

	return next.mock.calls[0][0];
}

function expectCelebrateErrorWithDetail(error: CelebrateError, where: Segments, what: string): void {
	expect(error).toBeInstanceOf(CelebrateError);

	const validationError = error.details.get(where);

	expect(validationError).toBeInstanceOf(Joi.ValidationError);
	expect(validationError).toHaveProperty("details", expect.arrayContaining([
		expect.objectContaining({
			message: what,
		}),
	]));
}

describe("POST /users", () => {
	let validator: RequestHandler;
	let controller: (...args: Parameters<RequestHandler>) => void | Promise<void>;

	const bodyValid: UserTypeCreation = {
		login: "whatever",
		password: "whateverPassword1",
		age: 42,
	};

	beforeEach(() => {
		[ validator, controller ] = createUser({
			userService: new UserServiceMock(),
		});
	});

	describe("validator", () => {
		let body!: Partial<UserTypeCreation>;

		beforeEach(() => {
			body = ({ ...bodyValid });
		});

		// FIXME: https://github.com/DefinitelyTyped/DefinitelyTyped/issues/34617#issuecomment-497760008
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		test.each<any>([
			[
				"\"login\" to be present",
				() => delete body.login,
				"\"login\" is required",
			],
			[
				"\"login\" to have at least one character",
				() => body.login = "",
				"\"login\" is not allowed to be empty",
			],
			[
				"\"login\" to have at most 32 characters",
				() => body.login = "a".repeat(33),
				"\"login\" length must be less than or equal to 32 characters long",
			],
			[
				"\"login\" to start with a letter",
				() => body.login = "1-hello-world",
				'"login" with value "1-hello-world" fails to match the alpha-numeric characters pattern',
			],
			[
				"\"login\" to only contain letters, digits, and hyphens",
				() => body.login = "hello-world-@",
				'"login" with value "hello-world-@" fails to match the alpha-numeric characters pattern',
			],
			[
				"\"password\" to be present",
				() => delete body.password,
				"\"password\" is required",
			],
			[
				"\"password\" to have at least one character",
				() => body.password = "",
				"\"password\" is not allowed to be empty",
			],
			[
				"\"password\" to have lowercase letters",
				() => body.password = "HELLO-WORLD-1",
				"\"password\" with value \"HELLO-WORLD-1\" fails to match the lowercase letters pattern",
			],
			[
				"\"password\" to have uppercase letters",
				() => body.password = "hello-world-1",
				"\"password\" with value \"hello-world-1\" fails to match the uppercase letters pattern",
			],
			[
				"\"password\" to have digits",
				() => body.password = "HELLO-world-one",
				"\"password\" with value \"HELLO-world-one\" fails to match the digits pattern",
			],
			[
				"\"age\" to be present",
				() => delete body.age,
				"\"age\" is required",
			],
			[
				"\"age\" to be at least 4",
				() => body.age = 3,
				"\"age\" must be greater than or equal to 4",
			],
			[
				"\"age\" to be at most 130",
				() => body.age = 131,
				"\"age\" must be less than or equal to 130",
			],
		])('should validate %s', (_name, prepare: Function, message: string, done: jest.DoneCallback) => {
			prepare();

			const [ req, res, next ] = generateRequestHandlerArgs(body);

			next.mockImplementation(() => {
				const error = expectToBeCalledOnceWithCelebrateError(next);

				expectCelebrateErrorWithDetail(error, Segments.BODY, message);

				done();
			});

			validator(req, res, next);
		});
	});

	describe("controller", () => {
		it("should respond with status 201, user ID, and user creation date", async () => {
			const [ req, res, next ] = generateRequestHandlerArgs(bodyValid);

			await controller(req, res, next);

			expect(res.status).toHaveBeenCalledTimes(1);
			expect(res.status).toHaveBeenLastCalledWith(201);

			expect(res.json).toHaveBeenCalledTimes(1);
			expect(res.json).toHaveBeenLastCalledWith({
				userID: "42",
				createdAt: "2021-06-07T19:28:29.517Z",
			});
		});
	})
});
