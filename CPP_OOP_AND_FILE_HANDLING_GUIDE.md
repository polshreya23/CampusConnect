# CampusConnect — C++ OOP and File Handling Guide

## 1. Current Architecture

CampusConnect currently has two separate backend layers:

1. **Existing web application:** React + TypeScript frontend → Node.js/Express API → root SQLite database, `campusconnect.db`. The frontend's Vite development proxy sends `/api` requests to the Node server (port 3001 by default).
2. **C++ OOP backend:** Crow HTTP server → C++ authentication/business foundation → SQLite database, `data/campusconnect_cpp.db` by default. The C++ server listens on port 3002 by default and is not yet a replacement for the full web application's API.

The React frontend must not be described as using the C++ backend for all CampusConnect features. The Node/Express backend remains the working backend for the full web application while the C++ backend is a separate foundation being migrated toward feature and API parity.

### Current C++ backend scope

The C++ implementation currently provides:

- A health route and login, session lookup, and logout routes.
- Authentication and in-memory session management.
- The `User` / `Student` / `Faculty` / `Admin` object-oriented hierarchy.
- An `IUserRepository` abstraction implemented by `SqliteUserRepository`.
- SQLite user persistence and lookup.
- `RegistrationRequest` and `RegistrationManager` classes for registration-request validation and text-file handling. The manager is **not connected to the C++ HTTP routes**.
- OOP demonstrations and core tests in `tests/test_core.cpp`.

It does not currently implement the full set of CampusConnect application APIs or features.

### Current C++ folder structure

```text
cpp-backend/
├── app/
│   └── main.cpp
├── include/
│   ├── api/Routes.hpp
│   ├── managers/
│   │   ├── DatabaseManager.hpp
│   │   ├── IUserRepository.hpp
│   │   ├── RegistrationManager.hpp
│   │   └── SqliteUserRepository.hpp
│   ├── models/
│   │   ├── RegistrationRequest.hpp
│   │   └── User.hpp
│   ├── services/
│   │   ├── AuthService.hpp
│   │   ├── RoleService.hpp
│   │   └── SessionService.hpp
│   └── utils/Exceptions.hpp
├── src/
│   ├── api/Routes.cpp
│   ├── managers/
│   │   ├── DatabaseManager.cpp
│   │   ├── RegistrationManager.cpp
│   │   └── SqliteUserRepository.cpp
│   ├── models/
│   │   ├── RegistrationRequest.cpp
│   │   └── User.cpp
│   └── services/
│       ├── AuthService.cpp
│       ├── RoleService.cpp
│       └── SessionService.cpp
├── tests/test_core.cpp
└── CMakeLists.txt
```

`Student`, `Faculty`, and `Admin` are declared alongside `User` in `include/models/User.hpp`; they do not have separate header files.

## 2. C++ Classes and Their Roles

| Class | Source/header | Current role |
|---|---|---|
| `User`, `Student`, `Faculty`, `Admin`, `UserData` | `include/models/User.hpp`, `src/models/User.cpp` | Common user data and role-specific permissions/identity |
| `RegistrationRequest` | `include/models/RegistrationRequest.hpp`, `src/models/RegistrationRequest.cpp` | Registration request data, accessors, status setter, and pipe-delimited serialization/parsing |
| `RegistrationManager` | `include/managers/RegistrationManager.hpp`, `src/managers/RegistrationManager.cpp` | Validates, lists, loads, and saves file-backed registration requests; not wired to HTTP routes |
| `IUserRepository` | `include/managers/IUserRepository.hpp` | Abstract user-lookup contract |
| `SqliteUserRepository` | `include/managers/SqliteUserRepository.hpp`, `src/managers/SqliteUserRepository.cpp` | Looks up users in SQLite and constructs role-specific `User` objects |
| `DatabaseManager` | `include/managers/DatabaseManager.hpp`, `src/managers/DatabaseManager.cpp` | Opens/closes the C++ backend database, initializes the `users` table, and executes SQL |
| `AuthService` | `include/services/AuthService.hpp`, `src/services/AuthService.cpp` | Validates login and coordinates user lookup, authorization, and session creation |
| `SessionService` | `include/services/SessionService.hpp`, `src/services/SessionService.cpp` | Creates, looks up, expires, and destroys in-memory sessions |
| `RoleService` | `include/services/RoleService.hpp`, `src/services/RoleService.cpp` | Checks whether a `User` can perform an action |
| `CorsMiddleware`, `CampusApp`, route handlers | `include/api/Routes.hpp`, `src/api/Routes.cpp` | Crow middleware/type alias and health/login/session/logout HTTP routes |
| `InvalidInputError`, `AuthenticationError`, `AuthorizationError`, `DatabaseError` | `include/utils/Exceptions.hpp` | Typed errors for input, authentication, authorization, and database failures |

## 3. OOP Concepts in the Current Source

### Encapsulation

- `RegistrationRequest` keeps its data members private and exposes getters plus `setStatus()` in `include/models/RegistrationRequest.hpp`.
- `User` exposes public getters for its data and virtual role/permission methods. However, its `UserData data_` member is **protected**, not private, in `include/models/User.hpp`; do not describe every `User` data member as private.
- `UserData` itself is a public struct with public fields. It is used to pass user data into the user hierarchy.

### Abstraction

- `IUserRepository` declares the pure virtual `findByIdentifier()` contract in `include/managers/IUserRepository.hpp`.
- `SqliteUserRepository` implements that contract in `include/managers/SqliteUserRepository.hpp` and `src/managers/SqliteUserRepository.cpp`.
- `AuthService` depends on `IUserRepository&`, not directly on the SQLite repository type, allowing the lookup implementation to be abstracted behind the interface.
- `AuthService` is a concrete service API; it is not itself a C++ interface.

### Inheritance

The role hierarchy declared in `include/models/User.hpp` is:

```text
User
├── Student
├── Faculty
└── Admin
```

The repository implementation relationship is separate:

```text
IUserRepository
└── SqliteUserRepository
```

The custom exception classes in `include/utils/Exceptions.hpp` also derive from standard exception types (`std::invalid_argument` or `std::runtime_error`).

### Runtime polymorphism

`User` declares pure virtual `roleName()` and `canPerform()` methods. `Student`, `Faculty`, and `Admin` override them in `src/models/User.cpp`. `makeUser()` returns a `std::unique_ptr<User>` containing the role-specific derived type, so calls through the base interface dispatch to the derived implementation. `tests/test_core.cpp` tests the role dispatch and permissions.

### Constructors and destructors

- `User(UserData)` initializes the base object's data in `src/models/User.cpp`; `User` has a virtual default destructor in `include/models/User.hpp`.
- `Student`, `Faculty`, and `Admin` inherit the `User` constructor using `using User::User`.
- `RegistrationRequest` has default and field-initializing constructors in `include/models/RegistrationRequest.hpp` and `src/models/RegistrationRequest.cpp`.
- `DatabaseManager` opens the SQLite connection in its constructor and closes it in its destructor (`src/managers/DatabaseManager.cpp`).
- On Windows, `SessionMutex` initializes and deletes a critical section in its constructor/destructor (`include/services/SessionService.hpp`).

### Composition and dependency wiring

`main()` in `app/main.cpp` creates the database manager, repository, session service, role service, and authentication service and wires them together. `AuthService` stores references to `IUserRepository`, `SessionService`, and `RoleService` in `include/services/AuthService.hpp`; these are non-owning references, not objects owned by `AuthService`. The repository in turn holds a reference to `DatabaseManager`. This is dependency composition/wiring; it should not be described as `AuthService` owning those dependencies.

## 4. STL Containers and Smart Pointers

### Containers and strings

| STL type | Where used | Purpose |
|---|---|---|
| `std::vector` | `RegistrationManager.hpp/.cpp`, `RegistrationRequest.cpp`, `tests/test_core.cpp` | Registration records, parsed line fields, and test collections |
| `std::array` | `src/services/SessionService.cpp` | Fixed-size byte array used to generate a session token |
| `std::unordered_map` | `include/services/SessionService.hpp` | Maps session tokens to in-memory session data |
| `std::string` | Throughout the C++ backend | Text values, identifiers, paths, and messages |

The project C++ source does not use `std::map` or `std::set`.

### Smart pointers

`std::unique_ptr` is used for:

- Polymorphic `User` objects returned by `makeUser()` and `IUserRepository::findByIdentifier()`.
- The prepared SQLite statement in `src/managers/SqliteUserRepository.cpp`, with a custom finalizer that calls `sqlite3_finalize`.
- Owning the database manager and repository in `app/main.cpp`.

The C++ source does not currently use `std::shared_ptr`.

## 5. Exceptions and RAII

`include/utils/Exceptions.hpp` defines `InvalidInputError`, `AuthenticationError`, `AuthorizationError`, and `DatabaseError`. The services and managers throw these for relevant validation, authentication, authorization, and database failures. `src/api/Routes.cpp` translates the typed exceptions into HTTP responses and also handles JSON parse errors and other standard exceptions.

RAII/resource management is demonstrated in several concrete places:

- `DatabaseManager` owns the lifetime of its SQLite connection by opening it in its constructor and closing it in its destructor.
- `SqliteUserRepository.cpp` wraps a prepared SQLite statement in `std::unique_ptr` with a custom finalizer.
- The Windows `SessionMutex` constructor/destructor manage a critical section.
- `std::unique_ptr` in `main()` owns the database and repository objects.

## 6. File Handling and Persistent Data

### Registration text file

`RegistrationManager` is a C++ class for registration-request file handling. Its default storage path is `./data/registration_requests.txt`, as declared in `include/managers/RegistrationManager.hpp`; a caller can provide a different path.

- `RegistrationManager::loadRequests()` uses `std::ifstream` to read the file line by line (`src/managers/RegistrationManager.cpp`).
- `RegistrationRequest::fromFileLine()` in `src/models/RegistrationRequest.cpp` parses pipe-delimited lines into request objects.
- `saveRequests()` uses `std::ofstream` with `std::ios::trunc` to rewrite the request list using `RegistrationRequest::toFileLine()`.
- Adding a request, listing requests, checking duplicates, and updating status load the records during those operations. **The C++ application does not automatically load registration records at startup.**
- `updateRequestStatus()` loads the current list, updates the matching record's status, then saves the list.
- If the input file cannot be opened, `loadRequests()` returns an empty vector. If the output file cannot be opened, `saveRequests()` returns without writing.

The class is compiled into the C++ core library and exercised by a core test, but `RegistrationManager` is **not constructed or called by the C++ HTTP route handlers**. It does not currently provide a connected registration or approval web workflow.

### SQLite data and in-memory sessions

| Store | Default/location | Current use |
|---|---|---|
| C++ SQLite database | `data/campusconnect_cpp.db`, relative to the C++ process working directory | The C++ backend's `DatabaseManager` initializes a `users` table and `SqliteUserRepository` reads user records. `CAMPUSCONNECT_CPP_DB` can override the path. |
| Node SQLite database | Root `campusconnect.db` | The Node/Express web application stores its broader application data, including users, registration requests, events, clubs, canteen, parking, lab requests, complaints, lost-and-found items, emergency records, and notifications. |
| C++ sessions | In process memory, in `SessionService` | Session data is stored in `std::unordered_map`; it is not persisted to SQLite and expires after 12 hours. |
| C++ test database | `campusconnect_cpp_test.db` in the test working directory | Temporary login/session test data created by `tests/test_core.cpp`; the test removes the file before and after the database test. |
| C++ registration test file | `campusconnect_registration_test.txt` in the test working directory | Temporary request-file test data; the registration test removes it before and after the test. |

`DatabaseManager` opens the configured SQLite file through `sqlite3_open_v2()` and initializes the C++ `users` table. The broader web application's data belongs to the separate Node database, not the C++ database.

## 7. Registration: C++ Classes vs Web Workflow

### C++ request model and file manager

- `RegistrationRequest` models a request, exposes accessors and `setStatus()`, and supports pipe-delimited file serialization/parsing.
- `RegistrationManager` supports adding requests, listing all or pending requests, duplicate checks, and changing a request's status in its text file. `addRequest()` validates required email/identifier fields and checks student emails for the `@vit.edu` domain.
- These classes do **not** implement an HTTP registration/approval flow. The C++ routes in `src/api/Routes.cpp` are health, login, session lookup, and logout only. There is no C++ registration, admin approval, or rejection route in the current route file.

### Actual web application's registration and admin decisions

The working web application's registration and approval/rejection workflow is implemented in `server/index.js` using Express and the Node SQLite database:

1. `POST /api/register` validates student/faculty registration fields and inserts a `Pending` row into the Node `registration_requests` table.
2. Admin-only `GET /api/admin/registration-requests` lists the requests.
3. Admin-only `PATCH /api/admin/registration-requests/:id/decision` accepts `Approved` or `Rejected`. Approval creates a user in the Node `users` table; rejection updates the request status.

This workflow must not be attributed to the C++ HTTP backend or `RegistrationManager`.

## 8. Current C++ Backend Scope vs Full CampusConnect Scope

“Not implemented” in the C++ column means the feature is not currently exposed as a C++ application API; the Node web application provides the listed working web functionality.

| Feature | Current C++ Backend | Current Web Application |
|---|---|---|
| Authentication | Login route; user lookup through SQLite repository | Express login and role checks |
| Sessions | In-memory C++ sessions; lookup/logout routes | Express session-based login/session/logout |
| Student registration | `RegistrationRequest` model and unconnected file manager; no C++ registration route | `POST /api/register` stores pending requests |
| Registration approval | No C++ HTTP approval/rejection route; manager can update file request status | Admin request listing and approve/reject route |
| Events | Not implemented in C++ API | Event API and SQLite data |
| Clubs | Not implemented in C++ API | Club listing and membership-request API |
| Canteen | Not implemented in C++ API | Menu, order, payment-related and order-status APIs |
| Parking | Not implemented in C++ API | Parking APIs and SQLite data |
| Lab booking | Not implemented in C++ API | Lab request and status APIs |
| Complaints | Not implemented in C++ API | Complaint APIs and SQLite data |
| Lost & Found | Not implemented in C++ API | Lost-and-found APIs and SQLite data |
| Emergency | Not implemented in C++ API | Emergency record and status APIs |
| Notifications | Not implemented in C++ API | Notification listing and read-status APIs |
| Dashboard | Not implemented in C++ API | Dashboard summary API |

The C++ backend's current Crow routes are declared/registered in `src/api/Routes.cpp`: `/api/health`, `/api/login`, `/api/session`, and `/api/logout` (with `OPTIONS` handling). They do not include the feature routes listed in the web application column.

## 9. What is Demonstrated for the OOP Requirement

| Requirement | Demonstration in current source |
|---|---|
| Classes and objects | Models, managers, repositories, and services are declared in `cpp-backend/include/` and implemented in `cpp-backend/src/`; `app/main.cpp` constructs and connects runtime objects. |
| Encapsulation | `RegistrationRequest` has private fields and controlled accessors; `User` provides getters but keeps `data_` protected rather than private. |
| Inheritance | `Student`, `Faculty`, and `Admin` inherit from `User`; `SqliteUserRepository` implements `IUserRepository`. |
| Abstraction | `IUserRepository` specifies user lookup independently of the SQLite implementation; `AuthService` consumes the interface. |
| Runtime polymorphism | Virtual `User` methods are overridden by the role classes and dispatched through base-class pointers/references. |
| Constructors/destructors | User/request/database and platform mutex lifecycle methods initialize state/resources and clean up where implemented. |
| STL containers | `vector`, `array`, and `unordered_map` appear in registration, session, and test code; `string` is used throughout. |
| Smart pointers | `unique_ptr` manages polymorphic users, a SQLite statement, and selected object lifetimes. |
| Exception handling | Custom exception types are thrown by services/managers and translated at the C++ HTTP boundary. |
| RAII | Database connection, SQLite statement, Windows critical section, and selected object ownership are tied to object lifetimes. |
| SQLite persistence | `DatabaseManager` initializes the C++ users table and the repository reads user records. |
| Text-file persistence | `RegistrationManager` reads and rewrites serialized request records when its operations are called. |
| Testing | `tests/test_core.cpp` tests role inheritance/polymorphism, database login and sessions, and student email validation through the request manager. |

## 10. Important Architecture Note

The project is intentionally being migrated toward a C++ backend, but the migration has not reached full feature/API parity. The existing React + TypeScript application continues to use the Node.js/Express backend and root `campusconnect.db` for the working CampusConnect feature set. The Vite development proxy targets the Node server by default. The C++ Crow backend is separate and currently provides a health/authentication foundation with its own SQLite database. Therefore, do not say that the React frontend currently communicates with the C++ backend for all CampusConnect features.

The C++ backend's default database path is `data/campusconnect_cpp.db`; `CAMPUSCONNECT_CPP_DB` can select another path. Its in-memory sessions are separate from the SQLite user persistence. `cpp-backend/README.md` also says to keep the Node service active until API parity has been implemented and independently verified.

## 11. Viva Explanation

“CampusConnect currently has a React and TypeScript web application whose `/api` requests go to a Node.js/Express backend backed by the root `campusconnect.db`. A separate Crow-based C++ backend is being developed toward eventual feature parity; it currently provides health, login, session, and logout routes, uses its own SQLite database for users, and keeps sessions in memory. In the C++ code, `User` is an abstract base class with `Student`, `Faculty`, and `Admin` derived roles. Virtual role and permission methods demonstrate runtime polymorphism, while `IUserRepository` abstracts user lookup from its SQLite implementation. The C++ backend also contains a `RegistrationRequest` model and a `RegistrationManager` that demonstrates validation and text-file persistence, but that manager is not connected to C++ HTTP routes. The actual student registration and admin approval/rejection workflow remains in the Node server. Core tests exercise the role behavior, login/session flow, and registration validation.”
