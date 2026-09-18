import pandas as pd

file_path = "/Users/2udays/Desktop/DATA/IMS_Bearing_Dataset/3rd_test/2004.03.06.06.02.46"

df = pd.read_csv(
    file_path,
    sep=r"\s+",
    header=None
)

print(df.head())
print(df.shape)