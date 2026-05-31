import styled from '@emotion/styled';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button } from '../../components/Button';
import { Dropdown, type DropdownOption } from '../../components/Dropdown';
import { Input } from '../../components/Input';
import { RangeSlider } from '../../components/Rangeslider';
import { TextArea } from '../../components/TextArea';
import { tokens } from '../../design-system/tokens.generated';
import { typography } from '../../design-system/typography.generated';

const PARTY_TYPE_OPTIONS: DropdownOption[] = [
  { label: '가족', value: 'FAMILY' },
  { label: '친구', value: 'FRIENDS' },
  { label: '연인', value: 'LOVERS' },
  { label: '동료', value: 'COLLEAGUES' },
];

const PEOPLE_OPTIONS: DropdownOption[] = Array.from({ length: 10 }, (_, i) => ({
  label: `${i + 1}명`,
  value: String(i + 1),
}));

const RecommendationFormPage = () => {
  const navigate = useNavigate();

  const [dateISO, setDateISO] = useState('');
  const [time24h, setTime24h] = useState('');
  const [stayDuration, setStayDuration] = useState('');
  const [numberOfPeople, setNumberOfPeople] = useState('');
  const [partyType, setPartyType] = useState('');
  const [budget, setBudget] = useState<[number, number]>([0, 100000]);
  const [request, setRequest] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async () => {
    if (!dateISO || !time24h || !stayDuration || !numberOfPeople || !partyType || !request) return;

    setIsLoading(true);
    try {
      const res = await fetch('http://localhost:3000/api/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schedule: {
            dateISO,
            time24h,
            stayDurationMinutes: Number(stayDuration),
          },
          location: [{ lat: 37.5665, lng: 126.978 }], // 서울 시청 기본값
          numberOfPeople: Number(numberOfPeople),
          partyType,
          budgetPerPerson: budget,
          userNaturalLanguageRequest: request,
        }),
      });
      const data = await res.json() as { jobId: string };
      navigate(`/place/recommendation/pending?jobId=${data.jobId}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <S.Page>
      <S.Container>
        <S.Title>장소 추천</S.Title>
        <S.Form>
          <S.Field>
            <S.Label>날짜</S.Label>
            <Input type="date" value={dateISO} onChange={(e) => setDateISO(e.target.value)} />
          </S.Field>
          <S.Field>
            <S.Label>시간</S.Label>
            <Input type="time" value={time24h} onChange={(e) => setTime24h(e.target.value)} />
          </S.Field>
          <S.Field>
            <S.Label>체류 시간 (분)</S.Label>
            <Input
              type="number"
              placeholder="예: 120"
              value={stayDuration}
              onChange={(e) => setStayDuration(e.target.value)}
            />
          </S.Field>
          <S.Row>
            <S.Field>
              <S.Label>인원</S.Label>
              <Dropdown
                options={PEOPLE_OPTIONS}
                value={numberOfPeople}
                onChange={setNumberOfPeople}
                placeholder="인원 선택"
              />
            </S.Field>
            <S.Field>
              <S.Label>유형</S.Label>
              <Dropdown
                options={PARTY_TYPE_OPTIONS}
                value={partyType}
                onChange={setPartyType}
                placeholder="유형 선택"
              />
            </S.Field>
          </S.Row>
          <S.Field>
            <S.Label>인당 예산 (원)</S.Label>
            <RangeSlider
              min={0}
              max={100000}
              defaultValue={budget}
              onChange={(val) => setBudget(val as [number, number])}
            />
            <S.BudgetLabel>
              {budget[0].toLocaleString()}원 ~ {budget[1].toLocaleString()}원
            </S.BudgetLabel>
          </S.Field>
          <S.Field>
            <S.Label>요청사항</S.Label>
            <TextArea
              placeholder="원하는 장소나 분위기를 자유롭게 적어주세요"
              value={request}
              onChange={(e) => setRequest(e.target.value)}
            />
          </S.Field>
          <Button tone="primary" width="full" onClick={handleSubmit} disabled={isLoading}>
            {isLoading ? '요청 중...' : '추천 받기'}
          </Button>
        </S.Form>
      </S.Container>
    </S.Page>
  );
};

export default RecommendationFormPage;

const S = {
  Page: styled.main`
    min-height: 100vh;
    background: ${tokens.color.neutral[50]};
    display: flex;
    justify-content: center;
    padding: 48px 24px;
  `,
  Container: styled.div`
    width: 100%;
    max-width: 390px;
    display: flex;
    flex-direction: column;
    gap: 24px;
  `,
  Title: styled.h1`
    margin: 0;
    color: ${tokens.color.neutral[900]};
    ${typography.title.lg}
  `,
  Form: styled.div`
    display: flex;
    flex-direction: column;
    gap: 20px;
  `,
  Field: styled.div`
    display: flex;
    flex-direction: column;
    gap: 8px;
    flex: 1;
  `,
  Row: styled.div`
    display: flex;
    gap: 12px;
  `,
  Label: styled.label`
    color: ${tokens.color.neutral[700]};
    ${typography.label.sm}
  `,
  BudgetLabel: styled.span`
    color: ${tokens.color.secondary[500]};
    ${typography.body.xs}
  `,
};
