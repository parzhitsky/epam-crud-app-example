import type { Model } from "sequelize";
import type Entity from "../typings/db/entity";

/** @public */
namespace Service {
	export interface FindQuery {
		limit?: number;
	}
}

/** @public */
abstract class Service<
	M extends Model,
	ValueType = M["_attributes"],
	ValueTypeCreation = M["_creationAttributes"],
> {
	protected abstract getRecord(id: string): Promise<M>;
	protected abstract updateAnyProps(id: string, props: Partial<Omit<ValueType, keyof Entity>>): Promise<M>;

	abstract find(query?: Service.FindQuery): Promise<ValueType[]>;
	abstract create(props: ValueTypeCreation): Promise<ValueType>;
	abstract get(id: string): Promise<ValueType>;
	abstract update(id: string, props: Partial<ValueTypeCreation>): Promise<ValueType>;
	abstract delete(id: string): Promise<ValueType>;
}

export default Service;
