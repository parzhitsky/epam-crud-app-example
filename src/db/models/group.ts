import type Entity from "../typings/entity";
import type { ImplyTimestamps } from "../typings/with-timestamps";
import client, { Model, DataTypes } from "../client";

export type Permission = (typeof permissions)[number];

export interface GroupTypeCreation {
	name: string;
	permissions: Permission[];
}

export interface GroupType extends Entity, GroupTypeCreation {
}

export const permissions = [ "READ", "WRITE", "DELETE", "SHARE", "UPLOAD_FILES" ] as const;

export class Group extends Model<GroupType, GroupTypeCreation> {}

export default Group;

Group.init<ImplyTimestamps<Group>>({
	id: {
		type: DataTypes.BIGINT,
		primaryKey: true,
		allowNull: false,
		autoIncrement: true,
	},
	name: {
		type: DataTypes.STRING,
		allowNull: false,
	},
	permissions: {
		type: DataTypes.ARRAY(DataTypes.ENUM<Permission>(...permissions)),
		allowNull: false,
		defaultValue: [],
	},
}, {
	sequelize: client,
	tableName: "Groups",
});

Group.sync();