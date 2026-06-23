# Development store fixture

This fixture is documentation for a local or preview database. It is not a
production seed and must not be run automatically during deployment.

Create one store named **Example Market** with this route:

| Route order | Aisle | Direction  | Section order | Path order | Side  | Section label |
| ----------- | ----- | ---------- | ------------- | ---------- | ----- | ------------- |
| 0           | 1     | ascending  | 0             | 0          | left  | Produce       |
| 1           | 2     | ascending  | 0             | 1          | right | Dry goods     |
| 2           | 3     | descending | 0             | 2          | left  | Frozen        |

Useful matching records for manual testing are:

- Canonical concept `produce` with aliases `fresh broccoli` and `apples`.
- Canonical concept `rice` with alias `jasmine rice`, and `rice vinegar` in
  `excluded_terms`.
- Canonical concept `frozen vegetables` with alias `frozen peas`.

Assign each concept one `product_locations` row in the matching section. Add
one manual `shopping_lists` row with `state = active`, then enter shopping
items using their original text and a fractional or lexicographic `order_key`.
The route query places unresolved items after resolved ones while preserving
their `order_key` order.
