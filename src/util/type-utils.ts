import { SelectQueryBuilder } from '../query-builder/select-query-builder.js'
import { InsertResult } from '../query-builder/insert-result.js'
import { DeleteResult } from '../query-builder/delete-result.js'
import { UpdateResult } from '../query-builder/update-result.js'
import { KyselyTypeError } from './type-error.js'
import { Database } from '../database.js'

/**
 * Given a database type and a union of table names in that db, returns
 * a union type with all possible column names.
 *
 * Example:
 *
 * ```ts
 * interface Person {
 *   id: number
 * }
 *
 * interface Pet {
 *   name: string
 *   species: 'cat' | 'dog'
 * }
 *
 * interface Movie {
 *   stars: number
 * }
 *
 * interface Database {
 *   person: Person
 *   pet: Pet
 *   movie: Movie
 * }
 *
 * type Columns = AnyColumn<Database, 'person' | 'pet'>
 *
 * // Columns == 'id' | 'name' | 'species'
 * ```
 */
export type AnyColumn<DB extends Database, TB extends keyof DB['tables']> =
  // Inline version of DrainOuterGeneric for performance reasons.
  // Don't replace with DrainOuterGeneric!
  [DB] extends [Database]
    ? {
        [T in TB]: keyof DB['tables'][T]
      }[TB] &
        string
    : never

/**
 * Extracts a column type.
 */
export type ExtractColumnType<
  DB extends Database,
  TB extends keyof DB['tables'],
  C
> =
  // Inline version of DrainOuterGeneric for performance reasons.
  // Don't replace with DrainOuterGeneric!
  [DB] extends [Database]
    ? {
        [T in TB]: C extends keyof DB['tables'][T] ? DB['tables'][T][C] : never
      }[TB]
    : never

/**
 * Given a database type and a union of table names in that db, returns
 * a union type with all possible `table`.`column` combinations.
 *
 * Example:
 *
 * ```ts
 * interface Person {
 *   id: number
 * }
 *
 * interface Pet {
 *   name: string
 *   species: 'cat' | 'dog'
 * }
 *
 * interface Movie {
 *   stars: number
 * }
 *
 * interface Database {
 *   person: Person
 *   pet: Pet
 *   movie: Movie
 * }
 *
 * type Columns = AnyColumnWithTable<Database, 'person' | 'pet'>
 *
 * // Columns == 'person.id' | 'pet.name' | 'pet.species'
 * ```
 */
export type AnyColumnWithTable<
  DB extends Database,
  TB extends keyof DB['tables']
> = DrainOuterGeneric<
  {
    [T in TB]: T extends string
      ? keyof DB['tables'][T] extends string
        ? `${T}.${keyof DB['tables'][T]}`
        : never
      : never
  }[TB]
>

/**
 * Just like {@link AnyColumn} but with a ` as <string>` suffix.
 */
export type AnyAliasedColumn<
  DB extends Database,
  TB extends keyof DB['tables']
> = DrainOuterGeneric<
  {
    [T in TB]: T extends string
      ? keyof DB['tables'][T] extends string
        ? `${keyof DB['tables'][T]} as ${string}`
        : never
      : never
  }[TB]
>

/**
 * Just like {@link AnyColumnWithTable} but with a ` as <string>` suffix.
 */
export type AnyAliasedColumnWithTable<
  DB extends Database,
  TB extends keyof DB['tables']
> = DrainOuterGeneric<
  {
    [T in TB]: T extends string
      ? keyof DB['tables'][T] extends string
        ? `${T}.${keyof DB['tables'][T]} as ${string}`
        : never
      : never
  }[TB]
>

/**
 * Extracts the item type of an array.
 */
export type ArrayItemType<T> = T extends ReadonlyArray<infer I> ? I : never

/**
 * Any select query builder.
 */
export type AnySelectQueryBuilder = SelectQueryBuilder<any, any, any>

export type SimplifySingleResult<O> = O extends InsertResult
  ? O
  : O extends DeleteResult
  ? O
  : O extends UpdateResult
  ? O
  : Simplify<O> | undefined

export type SimplifyResult<O> = O extends InsertResult
  ? O
  : O extends DeleteResult
  ? O
  : O extends UpdateResult
  ? O
  : Simplify<O>

export type Simplify<T> = DrainOuterGeneric<{ [K in keyof T]: T[K] } & {}>

/**
 * Represents a database row whose column names and their types are unknown.
 */
export type UnknownRow = Record<string, unknown>

/**
 * Makes all properties of object type `T` nullable.
 */
export type Nullable<T> = { [P in keyof T]: T[P] | null }

/**
 * Evaluates to `true` if `T` is `never`.
 */
export type IsNever<T> = [T] extends [never] ? true : false

/**
 * Evaluates to `true` if `T` is `any`.
 */
export type IsAny<T> = 0 extends T & 1 ? true : false

/**
 * Evaluates to `true` if the types `T` and `U` are equal.
 */
export type Equals<T, U> = (<G>() => G extends T ? 1 : 2) extends <
  G
>() => G extends U ? 1 : 2
  ? true
  : false

export type NarrowPartial<S, T> = DrainOuterGeneric<
  T extends object
    ? {
        [K in keyof S & string]: K extends keyof T
          ? T[K] extends S[K]
            ? T[K]
            : KyselyTypeError<`$narrowType() call failed: passed type does not exist in '${K}'s type union`>
          : S[K]
      }
    : never
>

export type SqlBool = boolean | 0 | 1

/**
 * Utility to reduce depth of TypeScript's internal type instantiation stack.
 *
 * Example:
 *
 * ```ts
 * type A<T> = { item: T }
 *
 * type Test<T> = A<
 *   A<A<A<A<A<A<A<A<A<A<A<A<A<A<A<A<A<A<A<A<A<A<A<A<T>>>>>>>>>>>>>>>>>>>>>>>>
 * >
 *
 * type Error = Test<number> // Type instantiation is excessively deep and possibly infinite.ts (2589)
 * ```
 *
 * To fix this, we can use `DrainOuterGeneric`:
 *
 * ```ts
 * type A<T> = DrainOuterGeneric<{ item: T }>
 *
 * type Test<T> = A<
 *  A<A<A<A<A<A<A<A<A<A<A<A<A<A<A<A<A<A<A<A<A<A<A<A<T>>>>>>>>>>>>>>>>>>>>>>>>
 * >
 *
 * type Ok = Test<number> // Ok
 * ```
 */
export type DrainOuterGeneric<T> = [T] extends [unknown] ? T : never

export type ShallowRecord<K extends keyof any, T> = DrainOuterGeneric<{
  [P in K]: T
}>
