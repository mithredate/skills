# Code rubric

This rubric states conventions for code in any language. Use it when you write code or review a diff. A convention that the project documents overrides this rubric.

## Reads and writes

- **Writes are actions, queries are reads**. Name and organize them that way, in a CQRS style. Keep the split consistent across layers. This includes file names and branch names.
- **No generic `update` operations.** Give a domain operation a specific, intention-revealing action, such as `approve`, `decline`, or `reopen`. Extract shared mechanics into a composable or a helper that the specific actions use.
- Business logic does not live in a handler or a controller. State rules, such as allowed transitions and invariants, belong to the domain layer. The caller must not pass them in.

## Locality

- **Put code where a reader looks for it first.** Put a read of a record next to the other reads of that record, in the same unit. For example, in a project with one repository per entity, that unit is the repository. A reader then finds the read from the record, with no search.

## Data rules

A **data rule** states how stored records relate. For example, an order table holds two kinds of order for one booking. The main order holds the booking number in its own `number` column and has the type `BOOKING` or `SUBSCRIPTION`. Each later order holds the booking number in a separate `booking_number` column. A read of the orders of a booking must match both kinds.

- **One place for each business rule.** Put business logic and each invariant in one place. Every other place calls it. A copy is `blocking`, because copies drift and corrupt data.
- **Encapsulate a specific read.** A specific way to read a value lives in one unit, at the place that the locality rule gives. Examples are a match rule and a key fetch with its cache. For the example above, that unit is a `findOrdersOfBooking` method of the order repository. Every other place calls it. A copy is a `quality_note`, because a second copy of the match stays wrong when the rule changes. A plain read, such as a find by id, can repeat.
- **Limits in the query.** Put a cap or a limit in the query, not in a check after the load. A check after the load reads every row first.

## One shape for one kind

- **One shape for one kind.** In one module, give each kind of unit one name pattern and one folder pattern. A query, an action, and a result type are three kinds. A new unit uses the shape that its module already uses for that kind. For example, a change once put a new query in a folder of services that held no other query.
- If the module has no shape for the kind, use the shape that the project documents. If the project documents none, use the default shape.

## Default shape of a query

A **query** is a named unit that holds one read. It gets the database connection as a dependency, so a test can give it a test database.

- In class-based code, a query is a class `<What>Query` with one public method, such as `CustomerOrdersQuery`. The constructor takes the connection.
- In function-based code, a query is a function named by what it returns, such as `customerOrders(db, customerId)`. The database handle is its first parameter.
- Put the query in a `Query` folder of the module that owns the data. Use the folder case of the language.
- Put the result types next to the query. Name a result type by what it holds.

## Functions and data

- **Argument order.** Order the parameters from stable to volatile. Put the ambient context first, such as `event` or `db`. Then put the code-time configuration, and last the record that the function acts on. A partial application then stays possible, as in `requirePermissionOrBeOwner(user, permission, request)`.
- **Required parameters.** If a parameter exists because callers need different values, make it required, with no default. A default hides the caller that forgot the argument.
- **Non-null when always present.** Type a field as non-null when the data always holds it. Bad data then fails loudly. Never coerce a wrong type or an empty value to null. Never fall back to a default silently.
- **Typed results.** Return a typed result shape, not an untyped map or array. The shape can be a record, a struct, a class, or an algebraic type.
- **Named booleans.** If a condition has three or more operands, or negates another computed boolean, move it to a named boolean. The name states the check, such as `isOutsiderAccessingDraft`. The reader then reads the intent, not the logic.
- **Audit timestamps are not domain data.** Never drive business logic from `created_at` or `updated_at`. Add a column with a domain name, such as `submitted_at`. An audit field changes on every edit. A review round once used `updated_at` as its boundary, and each new review hid the earlier approvals.

## API evolution

- Never break an API silently. Deprecate it explicitly. Rename it with a `deprecated` prefix so its usage is visible. Build the new version in parallel. Migrate clients before you delete the old version.
