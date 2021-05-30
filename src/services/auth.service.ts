import ms from "ms";
import jwt from "jsonwebtoken";
import logger from "../log/logger";
import Logged from "../log/logged.decorator";
import type { UserType } from "../db/models/user";
import RefreshTokenDB from "../db/models/refresh-token";
import type UserService from "./user.service";
import Service from "./abstract.service";

/** @private */
interface Deps extends Service.Deps {
	userService?: UserService;
}

/** @private */
type AuthType = "Bearer" | "Basic";

/** @private */
const jwtTokenLifespans = {
	access: "30 seconds",
	refresh: "1 week",
} as const;

/** @private */
type JwtTokenType = keyof typeof jwtTokenLifespans;

/** @private */
type Token<Type extends JwtTokenType> = string & {
	/** @deprecated This doesn't exist in runtime */
	readonly __kind__: unique symbol;

	/** @deprecated This doesn't exist in runtime */
	readonly __type__: Type;
};

/** @private */
type PayloadData<Type extends JwtTokenType> = (Type extends "refresh" ? {
	userID: string;
	tokenID: string;
} : unknown);

/** @private */
type Payload<Type extends JwtTokenType = JwtTokenType> = {
	[key: string]: unknown;
	tokenType: Type;
	data?: PayloadData<Type>;
};

/** @private */
interface IssuedToken<Type extends JwtTokenType> {
	type: Type;
	value: Token<Type>;
	issuedAt: Date;
	expiresAt: Date | null;
}

/** @private */
interface WithAccessToken {
	accessToken: IssuedToken<"access">;
}

/** @private */
interface IssuedTokens extends WithAccessToken {
	refreshToken: IssuedToken<"refresh">;
}

/** @private */
const secret = process.env.JWT_TOKEN_SECRET;

export default class AuthService extends Service {
	constructor(deps?: Deps) {
		super(deps);
	}

	@Logged({ level: "debug" })
	protected parseAuthValue(expectedType: AuthType, auth: string | undefined): string {
		if (!auth)
			throw new AuthHeaderMissingError();

		const [ type, value ] = auth.split(" ");

		if (type !== expectedType)
			throw new AuthTypeUnexpectedError(type, expectedType);

		if (!value)
			throw new AuthHeaderMissingError();

		return value;
	}

	@Logged({ level: "debug" })
	protected async validateCreds(auth: string | undefined): Promise<UserType> {
		this.using<Deps, "userService">("userService");

		const credsRaw = this.parseAuthValue("Basic", auth);
		const creds = Buffer.from(credsRaw, "base64").toString("ascii");

		const [ login, password ] = creds.split(":");

		const user = await this.deps.userService.findByLogin(login);

		if (user == null || password !== user.password)
			throw new AuthCredentialsInvalidError(login);

		return user;
	}

	@Logged({ level: "debug" })
	protected sign<Type extends JwtTokenType>(payload: Payload<Type>, options?: jwt.SignOptions): Token<Type> {
		return jwt.sign(payload, secret, options) as Token<Type>;
	}

	@Logged({ level: "debug" })
	protected issueToken<Type extends JwtTokenType>(type: Type, data?: PayloadData<Type>): IssuedToken<Type> {
		const now = Date.now();
		const lifespan: string = jwtTokenLifespans[type];
		const token = this.sign<Type>({
			data,
			tokenType: type,
			iat: Math.floor(now / 1000),
		}, {
			expiresIn: lifespan,
		});

		return {
			type,
			value: token,
			issuedAt: new Date(now),
			expiresAt: new Date(now + ms(lifespan)),
		};
	}

	@Logged({ level: "debug" })
	protected async issueRefreshToken(userID: string): Promise<IssuedToken<"refresh">> {
		const destroyedCount = await RefreshTokenDB.destroy({ where: { userID } });

		if (destroyedCount > 0)
			logger.info(`Existing refresh token for user "${userID}" was invalidated`);

		const tokenDB = await RefreshTokenDB.create({ userID });
		const tokenID = tokenDB.getDataValue("id");

		return this.issueToken("refresh", { tokenID, userID });
	}

	@Logged()
	async login(auth: string | undefined, data?: unknown): Promise<IssuedTokens> {
		const user = await this.validateCreds(auth);
		const refreshToken = await this.issueRefreshToken(user.id);
		const accessToken = this.issueToken("access", data);

		return {
			accessToken,
			refreshToken,
		};
	}

	@Logged({ level: "debug" })
	protected extractPayload<Type extends JwtTokenType>(type: Type, token: string): Payload<Type> {
		try {
			return jwt.verify(token, secret, { clockTolerance: 1 }) as Payload<Type>;
		} catch (error: unknown) {
			if (error instanceof jwt.TokenExpiredError)
				throw new AuthTokenExpiredError(type, error.expiredAt);

			if (error instanceof jwt.JsonWebTokenError)
				throw new AuthJwtError(error);

			throw error;
		}
	}

	@Logged()
	parseToken<Type extends JwtTokenType>(expectedType: Type, auth: string | undefined): PayloadData<Type> | undefined {
		const token = this.parseAuthValue("Bearer", auth);
		const payload = this.extractPayload(expectedType, token);

		if (typeof payload !== "object")
			throw new AuthTokenPayloadUnknownError(payload, "payload is not of an object type");

		if ("tokenType" in payload === false)
			throw new AuthTokenPayloadUnknownError(payload, "tokenType property is missing");

		if (payload.tokenType !== expectedType)
			throw new AuthTokenTypeUnexpectedError(payload.tokenType, expectedType);

		return payload.data;
	}

	@Logged({ level: "debug" })
	protected async assertRefreshTokenKnown(userID: string, tokenID: string): Promise<void> {
		const tokenDB = await RefreshTokenDB.findOne({ where: { userID } });

		if (tokenDB == null)
			throw new AuthRefreshTokenUnknownError(`user "${userID}" does not have associated refresh tokens`);

		const token = tokenDB.get({ plain: true });

		if (token.id !== tokenID)
			throw new AuthRefreshTokenUnknownError(`refresh tokens "${tokenID}" is not associated with user "${userID}"`);
	}

	@Logged()
	async renew(auth: string | undefined, data?: unknown): Promise<WithAccessToken> {
		const tokenData = this.parseToken("refresh", auth);
		const payload = { data: tokenData } as const;

		if (typeof tokenData !== "object")
			throw new AuthTokenPayloadUnknownError(payload, "refresh token payload data is not an object");

		if ("tokenID" in tokenData === false)
			throw new AuthTokenPayloadUnknownError(payload, "tokenID property is missing in refresh token payload data object");

		if ("userID" in tokenData === false)
			throw new AuthTokenPayloadUnknownError(payload, "userID property is missing in refresh token payload data object");

		const { userID, tokenID } = tokenData;

		await this.assertRefreshTokenKnown(userID, tokenID);

		return {
			accessToken: this.issueToken("access", data),
		};
	}
}

export class AuthCredentialsInvalidError extends Service.Error {
	statusCode = 401;

	constructor(userLogin: string) {
		super(`Invalid credentials: the user "${userLogin}" does not exist, or the password is incorrect`);
	}
}

export class AuthHeaderMissingError extends Service.Error {
	statusCode = 401;

	constructor() {
		super('The "Authorization" header is missing in the request, or its value is empty');
	}
}

export class AuthTypeUnexpectedError extends Service.Error {
	statusCode = 401;

	constructor(actual: string, expected: AuthType) {
		super(`Unexpected type of authorization: expected "${expected}", got "${actual}" instead`);
	}
}

export class AuthTokenTypeUnexpectedError extends Service.Error {
	statusCode = 403;

	constructor(actual: JwtTokenType, expected: JwtTokenType) {
		super(`Unexpected JWT token type: expected ${expected} token, got ${actual} token instead`);
	}
}

export class AuthTokenPayloadUnknownError extends Service.Error {
	statusCode = 403;

	constructor(
		public payload: unknown,
		public hint: string,
	) {
		super("Refusing to verify token with unexpected payload");
	}
}

export class AuthTokenExpiredError extends Service.Error {
	statusCode = 403;

	@Logged({ level: "debug" })
	private static calcTimeAgo(then: Date): string {
		return ms(Date.now() - then.getTime(), { long: true });
	}

	constructor(type: JwtTokenType, expiration: Date) {
		super(`The supplied ${type} token has expired ${AuthTokenExpiredError.calcTimeAgo(expiration)} ago`);
	}
}

export class AuthRefreshTokenUnknownError extends Service.Error {
	statusCode = 403;

	constructor(
		public hint: string,
	) {
		super("Refusing to validate unknown refresh token");
	}
}

export class AuthJwtError extends Service.Error {
	statusCode = 401;

	constructor(
		public cause: jwt.JsonWebTokenError,
	) {
		super(`Authorization error: ${cause.message}`);
	}
}
