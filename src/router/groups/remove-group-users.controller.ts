import RequestValidation, { Joi, Segments } from "../request-validation";
import type { RequestHandler } from "express";
import GroupService from "../../services/group.service";
import { userIDs } from "./definitions";
import type WithUserIDs from "./with-user-ids.type";

/** @private */
const { requestValidator, request } = new RequestValidation<WithUserIDs>({
	[Segments.BODY]: Joi.object<WithUserIDs>({
		userIDs: userIDs.required(),
	}),
});

export default function removeGroupUsers(): RequestHandler[] {
	const groupService = new GroupService();

	return [
		requestValidator,
		async (req: typeof request, res) => {
			const userIDs = req.body.userIDs;
			const groupID = req.params.id;

			await groupService.removeUsersFromGroup(groupID, userIDs);

			res.redirect(303, `/groups/${groupID}/users`);
		},
	];
}