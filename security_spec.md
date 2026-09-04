# Security Specification for IssueTracker Pro

## Data Invariants
1. An Issue cannot be created without a valid `userId` matching the authenticated user.
2. Only an Admin can resolve an issue (set status to 'resolved' or 'closed').
3. Users can only update their own 'open' issues (limited fields).
4. `createdAt` is immutable.
5. `role` in the `users` collection cannot be modified by the user themselves.

## The Dirty Dozen Payloads (Rejection Tests)
1. Creating an issue with a `userId` that is not mine.
2. Creating a user profile with `role: 'admin'`.
3. Updating my own `role` from 'user' to 'admin'.
4. Resolving an issue as a regular 'user'.
5. Creating an Issue without a `title`.
6. Injecting a 1MB string into the `title` field.
7. Updating the `createdAt` timestamp of an existing issue.
8. Deleting an issue (Issues should only be 'closed', or only Admins can delete).
9. Listing all issues as a regular user (should only see own issues).
10. Modifying `areaId` to a non-existent ID string pattern.
11. Updating `status` to a non-enum value.
12. Updating `userName` in an issue to "Admin System" maliciously.

## Test Runner (Draft)
The `firestore.rules.test.ts` will verify these scenarios.
