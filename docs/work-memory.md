# Project Memory: ALOC Monorepo

## Purpose

프로젝트 전반의 지속적인 작업 원칙과 제품·디자인 의사결정을 기록한다.

## Current Direction

UI 작업은 [Figma UI 파일](https://www.figma.com/design/H5OzPbQABhetO0XyLKAX40/UI?node-id=1350-139&t=IvdaI0TYA0po8OCt-1)을 작업 기반 참고 자료로 사용한다. 다만 Figma는 완전한 단일 진실 공급원(source of truth)이 아니며, 구현·제품 요구사항·기존 코드의 검증된 동작을 함께 판단한다. 작업 결과에 맞추어 Figma 수정이 필요할 수 있다.

## Decisions

- Decision: Figma를 구현 작업의 기준점으로 참조하되, 절대적 명세로 취급하지 않는다.
  Rationale: 구현 과정에서 발견되는 제품 요구사항 및 기술 제약에 따라 코드와 디자인의 정합성을 조정할 수 있어야 한다.
  Date: 2026-08-10

- Decision: UI 구현의 변경이 디자인 산출물에도 영향을 미치면 Figma 업데이트 필요성을 명시하고, 범위에 포함되면 함께 반영한다.
  Rationale: 코드와 디자인 사이의 의도적 차이를 방치하지 않는다.
  Date: 2026-08-10

## Status

- 이 문서는 프로젝트 전반 작업의 현재 메모리로 생성되었다.

## Change Log

- 2026-08-10: Figma 활용 원칙과 관련 UI 파일 링크를 기록했다.
