# When to Mock

Mock at **system boundaries** only:

- External APIs (payment, email, etc.)
- Databases (sometimes - prefer test DB)
- Time/randomness
- File system (sometimes)

Don't mock:

- Your own classes/modules
- Internal collaborators
- Anything you control

## Designing the boundary

Pass each external client in, instead of creating it inside the code, so that a test can give a stub or a fake. Give each external operation its own function, such as `getUser(id)` and `createOrder(data)`, instead of one generic `fetch(endpoint, options)`. A fake of a generic fetcher needs a branch for each endpoint.
