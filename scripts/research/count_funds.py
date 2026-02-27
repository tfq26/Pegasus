import pandas as pd

df = pd.read_excel('/Users/taufeeqali/Projects/Pegasus/PortfolioGain-LossReport45ce8911-3904-4af4-b073-d6d594d76aef.xlsx', header=3)
items = df['Unnamed: 0'].tolist()

exclusions = ['Fund Name', 'Total', 'Member Total :', 'Group Total']
categories = ['Equity -  ', 'Debt -  ', 'Hybrid -  ']

funds = set()
for val in items:
    if isinstance(val, str) and val not in exclusions:
        is_category = False
        for cat in categories:
            if val.startswith(cat):
                is_category = True
                break
        if not is_category:
            funds.add(val)

print(f"Distinct funds found: {len(funds)}")
for fund in sorted(list(funds)):
    print(f"- {fund}")
