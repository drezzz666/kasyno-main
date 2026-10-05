# 🏢 Enterprise Branching Strategy & Git Workflow Guide

Ten dokument opisuje standardy zarządzania gałęziami (Branching Model) oraz przepływem pracy (Git Flow / Trunk-Based Enterprise), stosowane w profesjonalnych zespołach inżynierskich i korporacjach technologicznych.

---

## 🌳 1. Główne Gałęzie (Persistent Branches)

W repozytorium funkcjonują 3 stałe, chronione (Protected) gałęzie:

```
  main (Production)
   ▲
   │ [Pull Request po udanych testach na Staging]
  staging (Pre-production / UAT / QA)
   ▲
   │ [Pull Request z develop]
  develop (Development Integration)
   ▲
   │ [Pull Request z feature / bugfix]
  feature/*, bugfix/*, refactor/*
```

| Branch | Środowisko | Opis i Zasady |
| :--- | :--- | :--- |
| **`main`** | **Production** | Zawsze stabilny, gotowy do wdrożenia kod produkcyjny. Bezpośrednie pushe są **zablokowane**. Zmiany trafiają tu wyłącznie przez zweryfikowane Pull Requesty z gałęzi `staging` lub `hotfix/*`. Każdy merge tagowany jest wersją semantyczną (np. `v1.2.0`). |
| **`staging`** | **Pre-Production / Staging** | Środowisko testowe, identyczne z produkcyjnym (UAT, QA, load testing). Służy do ostatecznej weryfikacji funkcjonalności przed wejściem na produkcję. |
| **`develop`** | **Development** | Główna gałąź integracyjna dla programistów. Tutaj lądują wszystkie nowe ukończone funkcje przed wejściem na testy stagingowe. |

---

## 🌿 2. Gałęzie Robocze (Ephemeral / Temporary Branches)

Żaden programista nie pracuje bezpośrednio na `main`, `staging` ani `develop`. Nowe prace tworzone są w gałęziach krótkoterminowych (Short-lived branches).

### Konwencja Nazewnictwa:
Format: `<typ>/<opis-kebab-case>` lub `<typ>/<id-ticketu>-<opis>`

* **`feature/`** – nowa funkcjonalność:
  * Źródło: `develop` ➡️ Cel (PR): `develop`
  * Przykłady: `feature/roulette-multiplayer`, `feature/CAS-102-stripe-webhook`
* **`bugfix/`** – naprawa błędu wykrytego w trakcie developmentu/testów:
  * Źródło: `develop` (lub `staging`) ➡️ Cel (PR): `develop`
  * Przykłady: `bugfix/auth-token-expiration`, `bugfix/plinko-multiplier-rounding`
* **`hotfix/`** – krytyczna naprawa błędu na środowisku produkcyjnym:
  * Źródło: `main` ➡️ Cel (PR): `main` oraz zwrotnie do `develop`
  * Przykłady: `hotfix/security-jwt-bypass`, `hotfix/v1.0.1-db-deadlock`
* **`refactor/`** – zmiany w architekturze/kodzie bez zmiany logiki biznesowej:
  * Źródło: `develop` ➡️ Cel (PR): `develop`
  * Przykłady: `refactor/go-websocket-engine`
* **`chore/`** lub **`ci/`** – aktualizacje zależności, skryptów budowania, pipeline CI/CD:
  * Źródło: `develop` ➡️ Cel (PR): `develop`
  * Przykłady: `chore/update-deps`, `ci/github-actions-cache`

---

## 🔄 3. Standardowy Cykl Pracy (Workflow)

### Krok 1: Rozpoczęcie pracy nad nowym zadaniem
```bash
git checkout develop
git pull origin develop
git checkout -b feature/nowa-funkcja
```

### Krok 2: Regularne commity (Conventional Commits)
Stosujemy standard [Conventional Commits](https://www.conventionalcommits.org/):
* `feat: dodano obsługę nowych stawek zakładów`
* `fix: naprawiono wyliczanie salda przy rozłączeniu ws`
* `refactor: uproszczono strukturę menedżera gier`
* `perf: optymalizacja renderowania komponentu kasyna`

### Krok 3: Synchronizacja z gałęzią bazową przed PR
```bash
git checkout develop
git pull origin develop
git checkout feature/nowa-funkcja
git rebase develop
```

### Krok 4: Utworzenie Pull Requesta (PR)
1. Otwarcie PR z `feature/nowa-funkcja` do `develop`.
2. Uzupełnienie szablonu PR (opis zmian, testy, checklist).
3. Minimum 1 Code Review (Approve) od członka zespołu.
4. Przejście wszystkich testów automatycznych CI.
5. Merge strategią: **Squash & Merge** lub **Rebase & Merge** (zachowanie czystej historii).

---

## 🔒 4. Rekomendowane Reguły Ochrony Gałęzi (GitHub Branch Protection Rules)

Dla gałęzi `main`, `staging`, `develop` w ustawieniach GitHub (*Settings -> Branches*):

1. **Require a pull request before merging** (wymóg Pull Requesta, zakaz bezpośredniego `git push`).
2. **Require approvals**: minimum 1 zatwierdzenie (Code Review).
3. **Dismiss stale pull request approvals when new commits are pushed** (nowy commit unieważnia poprzednie review).
4. **Require status checks to pass before merging** (wymagane przejście testów CI/CD).
5. **Require branches to be up to date before merging** (wymóg aktualności z branchem docelowym).
6. **Include administrators** (reguły obowiązują także adminów).
7. **Do not allow force pushes / deletions** (zakaz `git push --force` i usuwania głównych gałęzi).

---

## 🚀 5. Cykl Wdrożeniowy (Release Process)

1. **Feature Freeze**: Gdy zbiór funkcji na `develop` jest gotowy, tworzony jest PR `develop` ➡️ `staging`.
2. **Staging Verification**: Na środowisku stagingowym prowadzone są testy integracyjne i E2E.
3. **Production Release**: Po akceptacji QA, tworzony jest PR `staging` ➡️ `main`.
4. **Tagging**: Po merge do `main` tworzony jest Release/Tag:
   ```bash
   git tag -a v1.2.0 -m "Release v1.2.0: Nowy system zakładów i optymalizacje"
   git push origin v1.2.0
   ```
5. **Back-sync**: W razie potrzeby synchronizacja wsteczna z `staging` i `develop`.
