import { InsertResult, Kysely } from '../../'

import {
  BUILT_IN_DIALECTS,
  clearDatabase,
  destroyTest,
  initTest,
  TestContext,
  testSql,
  expect,
  Person,
  Database,
  NOT_SUPPORTED,
  TEST_INIT_TIMEOUT,
  insertDefaultDataSet,
} from './test-setup.js'

for (const dialect of BUILT_IN_DIALECTS) {
  describe(`${dialect}: insert`, () => {
    let ctx: TestContext

    before(async function () {
      this.timeout(TEST_INIT_TIMEOUT)
      ctx = await initTest(dialect)
    })

    beforeEach(async () => {
      await insertDefaultDataSet(ctx)
    })

    afterEach(async () => {
      await clearDatabase(ctx)
    })

    after(async () => {
      await destroyTest(ctx)
    })

    it('should insert one row', async () => {
      const query = ctx.db.insertInto('person').values({
        id: ctx.db.generated,
        first_name: 'Foo',
        last_name: 'Barson',
        gender: 'other',
      })

      testSql(query, dialect, {
        postgres: {
          sql: 'insert into "person" ("first_name", "last_name", "gender") values ($1, $2, $3)',
          parameters: ['Foo', 'Barson', 'other'],
        },
        mysql: {
          sql: 'insert into `person` (`first_name`, `last_name`, `gender`) values (?, ?, ?)',
          parameters: ['Foo', 'Barson', 'other'],
        },
        sqlite: {
          sql: 'insert into "person" ("first_name", "last_name", "gender") values (?, ?, ?)',
          parameters: ['Foo', 'Barson', 'other'],
        },
      })

      const result = await query.executeTakeFirst()
      expect(result).to.be.instanceOf(InsertResult)

      if (dialect === 'postgres') {
        expect(result.insertId).to.equal(undefined)
      } else {
        expect(result.insertId).to.be.a('bigint')
      }

      expect(await getNewestPerson(ctx.db)).to.eql({
        first_name: 'Foo',
        last_name: 'Barson',
      })
    })

    it('should insert one row with complex values', async () => {
      const query = ctx.db.insertInto('person').values({
        id: ctx.db.generated,
        first_name: ctx.db
          .selectFrom('pet')
          .select(ctx.db.raw('max(name)').as('max_name')),
        last_name:
          dialect === 'sqlite'
            ? ctx.db.raw("'Bar' || 'son'")
            : ctx.db.raw("concat('Bar', 'son')"),
        gender: 'other',
      })

      testSql(query, dialect, {
        postgres: {
          sql: `insert into "person" ("first_name", "last_name", "gender") values ((select max(name) as "max_name" from "pet"), concat('Bar', 'son'), $1)`,
          parameters: ['other'],
        },
        mysql: {
          sql: "insert into `person` (`first_name`, `last_name`, `gender`) values ((select max(name) as `max_name` from `pet`), concat('Bar', 'son'), ?)",
          parameters: ['other'],
        },
        sqlite: {
          sql: `insert into "person" ("first_name", "last_name", "gender") values ((select max(name) as "max_name" from "pet"), 'Bar' || 'son', ?)`,
          parameters: ['other'],
        },
      })

      const result = await query.executeTakeFirst()
      expect(result).to.be.instanceOf(InsertResult)

      expect(await getNewestPerson(ctx.db)).to.eql({
        first_name: 'Hammo',
        last_name: 'Barson',
      })
    })

    it('should insert the result of a select query', async () => {
      const query = ctx.db
        .insertInto('person')
        .columns(['first_name', 'gender'])
        .expression((eb) =>
          eb
            .selectFrom('pet')
            .select(['name', ctx.db.raw('?', ['other']).as('gender')])
        )

      testSql(query, dialect, {
        postgres: {
          sql: 'insert into "person" ("first_name", "gender") select "name", $1 as "gender" from "pet"',
          parameters: ['other'],
        },
        mysql: {
          sql: 'insert into `person` (`first_name`, `gender`) select `name`, ? as `gender` from `pet`',
          parameters: ['other'],
        },
        sqlite: {
          sql: 'insert into "person" ("first_name", "gender") select "name", ? as "gender" from "pet"',
          parameters: ['other'],
        },
      })

      await query.execute()

      const persons = await ctx.db
        .selectFrom('person')
        .select('first_name')
        .orderBy('first_name')
        .execute()

      expect(persons.map((it) => it.first_name)).to.eql([
        'Arnold',
        'Catto',
        'Doggo',
        'Hammo',
        'Jennifer',
        'Sylvester',
      ])
    })

    if (dialect === 'mysql') {
      it('should insert one row and ignore conflicts using insert ignore', async () => {
        const [existingPet] = await ctx.db
          .selectFrom('pet')
          .selectAll()
          .limit(1)
          .execute()

        const query = ctx.db
          .insertInto('pet')
          .ignore()
          .values({ ...existingPet, id: ctx.db.generated })

        testSql(query, dialect, {
          mysql: {
            sql: 'insert ignore into `pet` (`name`, `owner_id`, `species`) values (?, ?, ?)',
            parameters: [
              existingPet.name,
              existingPet.owner_id,
              existingPet.species,
            ],
          },
          postgres: NOT_SUPPORTED,
          sqlite: NOT_SUPPORTED,
        })

        const result = await query.executeTakeFirst()

        expect(result).to.be.instanceOf(InsertResult)
        expect(result.insertId).to.equal(undefined)
      })
    } else {
      it('should insert one row and ignore conflicts using `on conflict do nothing`', async () => {
        const [existingPet] = await ctx.db
          .selectFrom('pet')
          .selectAll()
          .limit(1)
          .execute()

        const query = ctx.db
          .insertInto('pet')
          .values({ ...existingPet, id: ctx.db.generated })
          .onConflict((oc) => oc.column('name').doNothing())

        testSql(query, dialect, {
          postgres: {
            sql: 'insert into "pet" ("name", "owner_id", "species") values ($1, $2, $3) on conflict ("name") do nothing',
            parameters: [
              existingPet.name,
              existingPet.owner_id,
              existingPet.species,
            ],
          },
          sqlite: {
            sql: 'insert into "pet" ("name", "owner_id", "species") values (?, ?, ?) on conflict ("name") do nothing',
            parameters: [
              existingPet.name,
              existingPet.owner_id,
              existingPet.species,
            ],
          },
          mysql: NOT_SUPPORTED,
        })

        const result = await query.executeTakeFirst()
        expect(result).to.be.instanceOf(InsertResult)

        if (dialect === 'sqlite') {
          // SQLite seems to return the last inserted id even if nothing got inserted.
          expect(result.insertId! > 0n).to.be.equal(true)
        } else {
          expect(result.insertId).to.equal(undefined)
        }
      })
    }

    if (dialect === 'postgres') {
      it('should insert one row and ignore conflicts using `on conflict on constraint do nothing`', async () => {
        const [existingPet] = await ctx.db
          .selectFrom('pet')
          .selectAll()
          .limit(1)
          .execute()

        const query = ctx.db
          .insertInto('pet')
          .values({ ...existingPet, id: ctx.db.generated })
          .onConflict((oc) => oc.constraint('pet_name_key').doNothing())

        testSql(query, dialect, {
          postgres: {
            sql: 'insert into "pet" ("name", "owner_id", "species") values ($1, $2, $3) on conflict on constraint "pet_name_key" do nothing',
            parameters: [
              existingPet.name,
              existingPet.owner_id,
              existingPet.species,
            ],
          },
          mysql: NOT_SUPPORTED,
          sqlite: NOT_SUPPORTED,
        })

        const result = await query.executeTakeFirst()
        expect(result).to.be.instanceOf(InsertResult)
        expect(result.insertId).to.equal(undefined)
      })
    }

    if (dialect === 'mysql') {
      it('should update instead of insert on conflict when using onDuplicateKeyUpdate', async () => {
        const [existingPet] = await ctx.db
          .selectFrom('pet')
          .selectAll()
          .limit(1)
          .execute()

        const query = ctx.db
          .insertInto('pet')
          .values({ ...existingPet, id: ctx.db.generated })
          .onDuplicateKeyUpdate({ species: 'hamster' })

        testSql(query, dialect, {
          mysql: {
            sql: 'insert into `pet` (`name`, `owner_id`, `species`) values (?, ?, ?) on duplicate key update `species` = ?',
            parameters: [
              existingPet.name,
              existingPet.owner_id,
              existingPet.species,
              'hamster',
            ],
          },
          postgres: NOT_SUPPORTED,
          sqlite: NOT_SUPPORTED,
        })

        await query.execute()

        const updatedPet = await ctx.db
          .selectFrom('pet')
          .selectAll()
          .where('id', '=', existingPet.id)
          .executeTakeFirstOrThrow()

        expect(updatedPet).to.containSubset({
          name: 'Catto',
          species: 'hamster',
        })
      })
    } else {
      it('should update instead of insert on conflict when using `on conflict do update`', async () => {
        const [existingPet] = await ctx.db
          .selectFrom('pet')
          .selectAll()
          .limit(1)
          .execute()

        const query = ctx.db
          .insertInto('pet')
          .values({ ...existingPet, id: ctx.db.generated })
          .onConflict((oc) =>
            oc.columns(['name']).doUpdateSet({ species: 'hamster' })
          )

        testSql(query, dialect, {
          postgres: {
            sql: 'insert into "pet" ("name", "owner_id", "species") values ($1, $2, $3) on conflict ("name") do update set "species" = $4',
            parameters: [
              existingPet.name,
              existingPet.owner_id,
              existingPet.species,
              'hamster',
            ],
          },
          mysql: NOT_SUPPORTED,
          sqlite: {
            sql: 'insert into "pet" ("name", "owner_id", "species") values (?, ?, ?) on conflict ("name") do update set "species" = ?',
            parameters: [
              existingPet.name,
              existingPet.owner_id,
              existingPet.species,
              'hamster',
            ],
          },
        })

        await query.execute()

        const updatedPet = await ctx.db
          .selectFrom('pet')
          .selectAll()
          .where('id', '=', existingPet.id)
          .executeTakeFirstOrThrow()

        expect(updatedPet).to.containSubset({
          name: 'Catto',
          species: 'hamster',
        })
      })
    }

    if (dialect === 'postgres') {
      it('should update instead of insert on conflict when using `on conflict on constraint do update`', async () => {
        const [existingPet] = await ctx.db
          .selectFrom('pet')
          .selectAll()
          .limit(1)
          .execute()

        const query = ctx.db
          .insertInto('pet')
          .values({ ...existingPet, id: ctx.db.generated })
          .onConflict((oc) =>
            oc.constraint('pet_name_key').doUpdateSet({ species: 'hamster' })
          )
          .returningAll()

        testSql(query, dialect, {
          postgres: {
            sql: 'insert into "pet" ("name", "owner_id", "species") values ($1, $2, $3) on conflict on constraint "pet_name_key" do update set "species" = $4 returning *',
            parameters: [
              existingPet.name,
              existingPet.owner_id,
              existingPet.species,
              'hamster',
            ],
          },
          mysql: NOT_SUPPORTED,
          sqlite: NOT_SUPPORTED,
        })

        const result = await query.executeTakeFirst()

        expect(result).to.containSubset({
          name: 'Catto',
          species: 'hamster',
        })
      })

      it('should update instead of insert on conflict when using `on conflict do update where`', async () => {
        const [existingPet] = await ctx.db
          .selectFrom('pet')
          .selectAll()
          .limit(1)
          .execute()

        const query = ctx.db
          .insertInto('pet')
          .values({ ...existingPet, id: ctx.db.generated })
          .onConflict((oc) =>
            oc
              .column('name')
              .where('name', '=', 'Catto')
              .doUpdateSet({ species: 'hamster' })
              .where('excluded.name', '!=', 'Doggo')
          )
          .returningAll()

        testSql(query, dialect, {
          postgres: {
            sql: 'insert into "pet" ("name", "owner_id", "species") values ($1, $2, $3) on conflict ("name") where "name" = $4 do update set "species" = $5 where "excluded"."name" != $6 returning *',
            parameters: [
              existingPet.name,
              existingPet.owner_id,
              existingPet.species,
              'Catto',
              'hamster',
              'Doggo',
            ],
          },
          mysql: NOT_SUPPORTED,
          sqlite: NOT_SUPPORTED,
        })

        await query.execute()
      })

      it('should insert multiple rows', async () => {
        const query = ctx.db
          .insertInto('person')
          .values([
            {
              id: ctx.db.generated,
              first_name: 'Foo',
              last_name: 'Barson',
              gender: 'other',
            },
            {
              id: ctx.db.generated,
              first_name: 'Baz',
              last_name: 'Spam',
              gender: 'other',
            },
          ])
          .returningAll()

        testSql(query, dialect, {
          postgres: {
            sql: 'insert into "person" ("first_name", "last_name", "gender") values ($1, $2, $3), ($4, $5, $6) returning *',
            parameters: ['Foo', 'Barson', 'other', 'Baz', 'Spam', 'other'],
          },
          mysql: NOT_SUPPORTED,
          sqlite: NOT_SUPPORTED,
        })

        const result = await query.execute()
        expect(result).to.have.length(2)
      })

      it('should return data using `returning`', async () => {
        const result = await ctx.db
          .insertInto('person')
          .values({
            id: ctx.db.generated,
            gender: 'other',
            first_name: ctx.db
              .selectFrom('person')
              .select(ctx.db.raw('max(first_name)').as('max_first_name')),
            last_name: ctx.db.raw(
              'concat(cast(? as varchar), cast(? as varchar))',
              ['Bar', 'son']
            ),
          })
          .returning(['first_name', 'last_name', 'gender'])
          .executeTakeFirst()

        expect(result).to.eql({
          first_name: 'Sylvester',
          last_name: 'Barson',
          gender: 'other',
        })

        expect(await getNewestPerson(ctx.db)).to.eql({
          first_name: 'Sylvester',
          last_name: 'Barson',
        })
      })

      it('should return data using `returningAll`', async () => {
        const result = await ctx.db
          .insertInto('person')
          .values({
            id: ctx.db.generated,
            gender: 'other',
            first_name: ctx.db
              .selectFrom('person')
              .select(ctx.db.raw('max(first_name)').as('max_first_name')),
            last_name: ctx.db.raw(
              'concat(cast(? as varchar), cast(? as varchar))',
              ['Bar', 'son']
            ),
          })
          .returningAll()
          .executeTakeFirst()

        expect(result).to.containSubset({
          first_name: 'Sylvester',
          last_name: 'Barson',
          gender: 'other',
        })

        expect(await getNewestPerson(ctx.db)).to.eql({
          first_name: 'Sylvester',
          last_name: 'Barson',
        })
      })
    }
  })

  async function getNewestPerson(
    db: Kysely<Database>
  ): Promise<Pick<Person, 'first_name' | 'last_name'> | undefined> {
    return await db
      .selectFrom('person')
      .select(['first_name', 'last_name'])
      .where(
        'id',
        '=',
        db.selectFrom('person').select(db.raw('max(id)').as('max_id'))
      )
      .executeTakeFirst()
  }
}
