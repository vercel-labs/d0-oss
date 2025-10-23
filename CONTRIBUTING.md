# Contributing to oss-data-analyst

Thank you for your interest in contributing to oss-data-analyst! This document provides guidelines and instructions for contributing to the project.

## Code of Conduct

Please be respectful and constructive in all interactions with the community.

## Getting Started

1. **Fork the repository** and clone it locally
2. **Install dependencies**: `pnpm install`
3. **Set up environment**: Copy `env.local.example` to `.env.local` and configure
4. **Run development server**: `pnpm dev`

## Development Workflow

### Making Changes

1. Create a new branch from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. Make your changes following our coding standards

3. Test your changes thoroughly

4. Commit your changes with clear, descriptive messages:
   ```bash
   git commit -m "feat: add new feature"
   ```

### Commit Message Guidelines

We follow conventional commit format:

- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation changes
- `style:` Code style changes (formatting, etc.)
- `refactor:` Code refactoring
- `test:` Test additions or changes
- `chore:` Maintenance tasks

### Pull Request Process

1. **Update documentation** if you've made significant changes
2. **Ensure tests pass** and add new tests if needed
3. **Update the README** if you've changed functionality
4. **Create a Pull Request** with a clear title and description
5. **Link any related issues** in the PR description
6. **Wait for review** - maintainers will review your PR

## Code Style

- **TypeScript**: Use TypeScript for all new code
- **Formatting**: Follow the existing code style
- **Naming**: Use descriptive variable and function names
- **Comments**: Add comments for complex logic
- **Types**: Add proper type definitions

## Project Structure

```
oss-data-analyst/
├── src/
│   ├── app/              # Next.js pages and API routes
│   ├── components/       # React components
│   ├── lib/             # Core agent logic
│   │   ├── oss-data-analyst-agent-advanced.ts  # Main agent implementation
│   │   ├── tools/       # Agent tools
│   │   └── prompts/     # System prompts
│   └── types/           # TypeScript types
├── public/              # Static assets
└── scripts/             # Development scripts
```

## Agent Development

### Adding New Tools

1. Create tool in appropriate directory (`tools/planning`, `tools/building`, etc.)
2. Define tool schema with clear descriptions
3. Implement tool logic
4. Add tool to phase configuration in `oss-data-analyst-agent-advanced.ts`
5. Update prompts if needed

### Modifying Prompts

Prompts are in `src/lib/prompts/`:
- `planning.ts` - Planning phase
- `building.ts` - SQL building phase
- `execution.ts` - Query execution phase
- `reporting.ts` - Results reporting phase

## Testing

- Test queries through the web interface
- Verify all phases complete successfully
- Check error handling and edge cases
- Test with various database schemas

## Reporting Issues

### Bug Reports

Include:
- Clear description of the issue
- Steps to reproduce
- Expected vs actual behavior
- Environment details (OS, Node version, etc.)
- Error messages or logs

### Feature Requests

Include:
- Clear description of the feature
- Use cases and benefits
- Possible implementation approach

## Questions?

- Open an issue for questions
- Check existing issues and PRs first
- Be patient - maintainers will respond when available

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
