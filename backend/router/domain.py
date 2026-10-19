"""Exact amounts and identities shared by adapters, controller, API and evaluation."""
from datetime import datetime, timezone
from decimal import Decimal
from typing import Annotated, Literal
from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

DecimalString = Annotated[str, StringConstraints(pattern=r'^\d+(\.\d+)?$', max_length=100)]
EVM_ADDRESS = r'^0x[0-9a-fA-F]{40}$'
Provider = Literal['paraspell', 'lifi', 'wormhole']

def now():
    return datetime.now(timezone.utc).isoformat()

def units(value: str, decimals: int) -> str:
    # Do not use the Decimal context for large token amounts (default precision is 28).
    whole, _, fraction = value.partition('.')
    if len(fraction) > decimals:
        raise ValueError('amount exceeds asset precision')
    return str(int(whole + fraction.ljust(decimals, '0')))

def human(value: str | int, decimals: int) -> str:
    n = str(int(value)).zfill(decimals + 1)
    if int(value) < 0:
        raise ValueError('negative amount')
    return (n if not decimals else n[:-decimals] + '.' + n[-decimals:]).rstrip('0').rstrip('.') if decimals else n

class Strict(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)

class EvmChain(Strict):
    ecosystem: Literal['evm']
    chainId: int = Field(gt=0)

class SubstrateChain(Strict):
    ecosystem: Literal['substrate']
    name: str = Field(min_length=1, max_length=100)
    genesisHash: str | None = None

Chain = Annotated[EvmChain | SubstrateChain, Field(discriminator='ecosystem')]

class Asset(Strict):
    chain: Chain
    kind: Literal['native', 'erc20', 'substrate']
    symbol: str = Field(min_length=1, max_length=30)
    decimals: int = Field(ge=0, le=255)
    address: str | None = Field(default=None, pattern=EVM_ADDRESS)
    assetIdentifier: str | None = None

    @model_validator(mode='after')
    def identity(self):
        if self.kind == 'substrate':
            if self.chain.ecosystem != 'substrate' or not self.assetIdentifier or self.address:
                raise ValueError('Substrate asset needs SDK identifier')
        elif self.chain.ecosystem != 'evm' or self.assetIdentifier:
            raise ValueError('EVM asset chain mismatch')
        elif self.kind == 'erc20' and (not self.address or int(self.address, 16) == 0):
            raise ValueError('nonzero token contract required')
        elif self.kind == 'native' and self.address:
            raise ValueError('native token has no contract')
        return self

    def key(self):
        return (self.chain.ecosystem, self.chain.chainId if self.chain.ecosystem == 'evm' else self.chain.name,
                self.kind, (self.address or self.assetIdentifier or 'native').lower())

class Constraints(Strict):
    maximumFeeUsd: DecimalString | None = None
    minimumReceived: DecimalString | None = None
    allowWrapped: bool = False
    maximumDurationSeconds: int | None = Field(default=None, gt=0)
    preference: Literal['cost', 'speed', 'output'] = 'cost'

class Intent(Strict):
    id: str = Field(min_length=1, max_length=100)
    naturalLanguage: str = Field(default='', max_length=10000)
    sourceAsset: Asset
    destinationAsset: Asset
    amount: DecimalString
    recipient: str = Field(min_length=1, max_length=100)
    constraints: Constraints = Field(default_factory=Constraints)

    @model_validator(mode='after')
    def check(self):
        import re
        if int(units(self.amount, self.sourceAsset.decimals)) <= 0:
            raise ValueError('amount must be positive')
        if self.sourceAsset.chain == self.destinationAsset.chain:
            raise ValueError('source and destination must differ')
        if self.destinationAsset.chain.ecosystem == 'evm':
            if not re.fullmatch(EVM_ADDRESS, self.recipient) or int(self.recipient, 16) == 0:
                raise ValueError('nonzero EVM recipient required')
        elif not re.fullmatch(r'[1-9A-HJ-NP-Za-km-z]{47,50}', self.recipient):
            raise ValueError('SS58 recipient required; SDK verifies checksum')
        if self.constraints.minimumReceived is not None:
            units(self.constraints.minimumReceived, self.destinationAsset.decimals)
        return self

class Amount(Strict):
    asset: Asset
    amount: DecimalString

class Fee(Strict):
    label: str
    amount: Amount
    includedInInput: bool
    estimatedUsd: DecimalString | None = None

class Step(Strict):
    id: str
    description: str
    chain: Chain
    action: Literal['approval', 'swap', 'bridge', 'redeem', 'transfer']

class Candidate(Strict):
    id: str
    intentId: str
    provider: Provider
    providerQuoteId: str | None = None
    sourceAsset: Asset
    sourceInput: Amount
    destinationAsset: Asset
    destinationRepresentation: Literal['native', 'wrapped', 'canonical', 'unknown']
    expectedOutput: Amount
    minimumOutput: Amount | None = None
    fees: list[Fee] = Field(default_factory=list)
    gasNeeds: list[Amount] = Field(default_factory=list)
    totalUserCostUsd: DecimalString | None = None
    feeComplete: bool = False
    estimatedDurationSeconds: int | None = Field(default=None, ge=0)
    quotedAt: str
    expiresAt: str | None = None
    warnings: list[str] = Field(default_factory=list)
    steps: list[Step] = Field(default_factory=list)
    provenance: Literal['live', 'fixture']
    raw: dict = Field(default_factory=dict)

class Wallet(Strict):
    ecosystem: Literal['evm', 'substrate']
    address: str | None = None
    chainId: int | None = None
    genesisHash: str | None = None
    connector: str | None = None
    signerAdapter: str | None = None
    status: Literal['disconnected', 'connecting', 'reconnecting', 'connected']

class PlanRequest(Strict):
    intent: Intent
    wallets: list[Wallet] = Field(default_factory=list)
    mode: Literal['deterministic', 'single-agent', 'two-role'] = 'deterministic'

class ChatRequest(Strict):
    message: str = Field(min_length=1, max_length=10000)
    history: list[dict] = Field(default_factory=list, max_length=20)
    wallets: list[Wallet] = Field(default_factory=list)
    mode: Literal['single-agent', 'two-role'] = 'two-role'

class Interpretation(Strict):
    intent: Intent | None = None
    clarification: str | None = None

    @model_validator(mode='after')
    def one(self):
        if (self.intent is None) == (not self.clarification):
            raise ValueError('return exactly one intent or clarification')
        return self

class Outcome(Strict):
    status: Literal['ready', 'clarification', 'rejected', 'unavailable', 'model_error']
    message: str
    intent: Intent | None = None
    candidates: list[Candidate] = Field(default_factory=list)
    selectedId: str | None = None
    rejected: list[dict] = Field(default_factory=list)
    errors: list[dict] = Field(default_factory=list)
    traceId: str
    executionEnabled: bool = False

def interpretation_schema():
    # A grammar with two mutually exclusive branches is easier for small models than
    # independent nullable fields plus a validator they cannot see.
    intent = Intent.model_json_schema()
    definitions = intent.pop('$defs', {})
    definitions['Intent'] = intent
    return {'anyOf':[
        {'type':'object','properties':{'intent':{'$ref':'#/$defs/Intent'}},'required':['intent'],'additionalProperties':False},
        {'type':'object','properties':{'clarification':{'type':'string','minLength':1}},'required':['clarification'],'additionalProperties':False}],
        '$defs':definitions}
