import { ThemeProvider } from "@emotion/react";
import styled from "@emotion/styled";
import { useState } from 'react';

import { Button } from "./components/Button";
import { Dropdown, type DropdownOption } from "./components/Dropdown";
import { Input } from "./components/Input";
import { RangeSlider } from "./components/Rangeslider";
import { theme } from "./design-system/theme.generated"; 
import { TextArea } from "./page/components/TextArea";

const S = {
  Wrapper: styled.div`
    display: flex;
    justify-content: center;
    align-items: center;
    width: 100%;
    height: 100vh;
    background-color: #f4f4f4;
  `,

  FormContainer: styled.div`
    display: flex;
    flex-direction: column;
    width: 360px;
    min-height: 600px;
    border: 2px solid #ffffff;
    border-radius: 12px;
    background-color: white;
    overflow: hidden;
  `,

  FormContent: styled.div`
    flex: 1;
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 20px;
  `,

  BottomSection: styled.div`
    margin-top: auto;
    display: flex;
    flex-direction: column;
    gap: 20px;
    padding: 0 28px 20px 28px;
  `,

};

export const App = () => {

  const [selectedValue, setSelectedValue] = useState<string>('');
  const options: DropdownOption[] = [
    { label : '1', value: 'one'},
    { label : '2', value: 'two'},
    { label : '3', value: 'three'},
  ];

  return (
    <ThemeProvider theme={theme}>
      <S.Wrapper>
        <S.FormContainer>
          <S.FormContent />


          <S.BottomSection>
            <Input 
              onChange={(e) => console.log(e.target.value)}
            />
            <Dropdown 
              options={options}
              value={selectedValue}
              onChange={setSelectedValue}
              placeholder="인원 선택"
              width="125px"
            />
            <RangeSlider
              min={0}
              max={10000}
              defaultValue={[3000, 7000]}
            />
            <TextArea />
            <Button 
              tone="primary" 
              width="full" 
              onClick={() => alert("")}
            >
              추천 받기
            </Button>
          </S.BottomSection>
        </S.FormContainer>
      </S.Wrapper>
    </ThemeProvider>
  );
};

export default App;