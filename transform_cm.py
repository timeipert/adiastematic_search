import monodikit as mk
import pandas as pd
corpus = mk.Corpus("/Users/timeipert/PycharmProjects/MonodiKit/data/*")
result = []
for document in corpus.documents:
    result.append(document.meta.as_record)
    result[-1]["volpiano"] = document.volpiano.replace("\n", "")

df = pd.DataFrame.from_records(result)
df.to_csv("corpus.csv")
