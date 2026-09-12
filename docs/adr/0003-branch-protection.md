# ADR 0003: Branch protection expectation

## Status
Accepted

## Decision
`main` is treated as a releasable branch. Pull requests should remain unmerged until required CI checks succeed. Emergency exceptions require a follow-up stabilization change before feature work resumes.
