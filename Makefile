# s3proxy-rs-ui development targets.

SHELL := /bin/bash
.DEFAULT_GOAL := help

UI_IMAGE_NAME ?= s3proxy-ui
IMAGE_TAG ?= local
UI_IMAGE_REF ?= $(UI_IMAGE_NAME):$(IMAGE_TAG)
NPM_REGISTRY ?= https://registry.npmjs.org/

.PHONY: help install check ui-check docker-build docker-build-ui aks-ui-test-job clean

## help: Show available targets.
help:
	@echo "s3proxy-rs-ui targets:"
	@grep -E '^## ' $(MAKEFILE_LIST) | sed -E 's/^## /  /'

## install: Install locked dependencies from the configured npm registry.
install:
	npm ci --ignore-scripts --registry=$(NPM_REGISTRY)

## check: Run the complete local UI validation gate.
check: ui-check

## ui-check: Run dependency audit, lint, unit, deploy, build, and browser tests.
ui-check: install
	npm audit --audit-level=high --registry=$(NPM_REGISTRY)
	scripts/release/validate-source.sh
	npm run test:e2e
	npm run test:e2e:a11y
	npm run test:e2e:cross-browser:container

## docker-build: Build the standalone UI image.
docker-build: docker-build-ui

## docker-build-ui: Build the standalone UI image with a local tag.
docker-build-ui:
	docker build --build-arg OCI_REVISION=$$(git rev-parse HEAD) -t $(UI_IMAGE_REF) .

## aks-ui-test-job: Schedule an in-cluster Job to validate the deployed UI.
aks-ui-test-job:
	scripts/deploy/test-ui-aks-job.sh

## clean: Remove generated UI artifacts.
clean:
	rm -rf dist playwright-report test-results sbom
