  import { PartyTypeSchema } from "@monorepo/recommendation-engine/v1/contracts";
  import { BudgetRangeSchema } from "@monorepo/recommendation-engine/v1/contracts"

  import { theme } from "../design-system/theme.generated";
  import { useRecommendationFormInput, useRecommendationFormUi } from "../pages/RecommendationForm/RecommendationForm.context"
  import { Button } from "./Button"
  import { Dropdown, type DropdownOption } from "./Dropdown"
  import { Input } from "./Input"
  import { RangeSlider } from "./Rangeslider";


  const FormContent = () => {
    const {
      location,
      date,
      time24h, setTime24h,
      stayDurationMinutes, setStayDurationMinutes,
      numberOfPeople, setNumberOfPeople,
      partyType, setPartyType,
      activityType, setActivityType,
      budgetPerPerson, setBudgetPerPerson,
      userNaturalLanguageRequest, setUserNaturalLanguageRequest,
    } = useRecommendationFormInput();

    const ACTIVITY_OPTIONS: DropdownOption[] = [
      { label: "식사", value: "MEAL" },
      { label: "카페", value: "CAFE" },
      { label: "술자리", value: "DRINK" },
      { label: "문화/액티비티", value: "ACTIVITY" },
    ];

    const PARTY_OPTIONS: DropdownOption[] = [
    { label: "친구", value: "FRIENDS" },
    { label: "가족", value: "FAMILY" },
    { label: "연인", value: "LOVERS" },
    { label: "동료", value: "COLLEAGUES" },
    ];

    const { openSheet } = useRecommendationFormUi();

    
    const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('ko-KR').format(value) + "원";
    };

    const formattedDate = date 
      ? `${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}` 
      : "";



    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%'}}>
        <div style={{ 
          padding: '18px 24px', 
        }}>
          <h2 style={{ fontSize: '16px', fontWeight: 'bold', margin: 0, color: theme.tokens.color.neutral["900"]}}>
            1. 폼 입력
          </h2>
        </div>

        <div style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          gap: '14px', 
          padding: '24px 28px',
          flex: 1,
          overflowY: 'auto' 
        }}>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label htmlFor="form-date" style={{
              fontSize: '14px',
              color: theme.tokens.color.neutral["700"],
              fontWeight: '500' }}>날짜</label>
            <Input
              id="form-date"
              value={formattedDate}
              placeholder=""
              onClick={() => openSheet("date")}
              readOnly 
              style={{ cursor: 'pointer' }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'row', gap: '12px' }}>          
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label htmlFor="form-time" style={{fontSize: '13px', color: theme.tokens.color.neutral["700"], fontWeight: '500' }}>시각</label>
              <Input
                id="form-time"
                value={time24h || ""}
                onChange={(e) => setTime24h(e.target.value)}
                placeholder=""
              />
            </div>
            
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label htmlFor="form-duration" style={{ fontSize: '13px', color: theme.tokens.color.neutral["700"], fontWeight: '500' }}>머무는 시간</label>
              <Input
                id="form-duration"
                value={stayDurationMinutes || ""}
                onChange={(e) => {
                  const onlyNumber = e.target.value.replace(/[^0-9]/g, '');
                  setStayDurationMinutes(onlyNumber ? Number(onlyNumber) : null);
                }}
                placeholder=""
              />
            </div>

          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label htmlFor="form-location" style={{ fontSize: '13px', color: theme.tokens.color.neutral["700"], fontWeight: '500' }}>위치</label>
            <Input
              id="form-location"
              value={location.roadNameAddress || ""}
              placeholder=""
              onClick={() => openSheet("location")}
              readOnly 
              style={{ cursor: 'pointer' }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <span style={{ fontSize: '13px', color: theme.tokens.color.neutral["700"], fontWeight: '500' }}>
                활동 유형
            </span>
            <Dropdown
              value={activityType || undefined} 
              onChange={(selectedValue) => setActivityType(selectedValue)} 
              options={ACTIVITY_OPTIONS}
              placeholder="선택"
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'row', gap: '16px' }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label htmlFor="form-people" style={{ fontSize: '13px', color: theme.tokens.color.neutral["700"], fontWeight: '500' }}>인원</label>
              <Input
                id="form-people"
                value={numberOfPeople || ""}
                onChange={(e) => {
                  const onlyNumber = e.target.value.replace(/[^0-9]/g, '');
                  setNumberOfPeople(onlyNumber ? Number(onlyNumber) : null);
                }}
                placeholder=""
              />
            </div>
            
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <span style={{ fontSize: '13px', color: theme.tokens.color.neutral["700"], fontWeight: '500' }}>관계 유형</span>
              <Dropdown
                value={partyType || undefined} 
                options={PARTY_OPTIONS}
                placeholder="선택"
                onChange={(val) => {
                  const parseResult = PartyTypeSchema.safeParse(val);
                  if (parseResult.success) {
                    setPartyType(parseResult.data);
                  }
                }} 
              />
            </div>
          </div>
        
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <span style={{ fontSize: '13px', color: theme.tokens.color.neutral["700"], fontWeight: '500' }}>1인당 예산</span>
      
              <span style={{ fontSize: '14px', fontWeight: 'bold', color: theme.tokens.color.neutral["700"] }}>
                {budgetPerPerson 
                  ? `${formatCurrency(budgetPerPerson[0])} ~ ${formatCurrency(budgetPerPerson[1])}` 
                : "금액을 설정해주세요"}
              </span>
          </div>
    
          <RangeSlider 
            min={0}             
            max={150000}        
            step={5000} 
            value={budgetPerPerson || [20000, 40000]} 
            onChange={(newValue) => {
              const parseResult = BudgetRangeSchema.safeParse(newValue);
        
              if (parseResult.success) {
                setBudgetPerPerson(parseResult.data);
              }
            }} 
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingBottom: '32px' }}>
          <span style={{ fontSize: '13px', color: theme.tokens.color.neutral["700"], fontWeight: '500' }}>요청사항</span>
          <textarea
            value={userNaturalLanguageRequest}
            onChange={(e) => setUserNaturalLanguageRequest(e.target.value)}
            placeholder="대화하기 좋은 저녁 식사 장소 추천"
            style={{
              width: '100%',
              height: '110px',
              padding: '14px',              
              backgroundColor: '#fff',
              border: '1px solid #e6dfd8',
              borderRadius: '8px',
              outline: 'none',
              resize: 'none',
              fontSize: '14px',
              color: '#141413',
            }}
            />
          </div>
          <div style={{ marginTop: 'auto', paddingTop: '24px' }}>
            <Button type="button" width="100%">
              추천 받기
            </Button>
          </div>
        </div>
      </div>
    );
  };

  export default FormContent;