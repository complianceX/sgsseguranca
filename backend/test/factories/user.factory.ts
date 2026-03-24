import { DataSource } from 'typeorm';
import { User } from '../../src/users/entities/user.entity';
import { Profile } from '../../src/profiles/entities/profile.entity';
import { PasswordService } from '../../src/common/services/password.service';

export type CreateUserFactoryInput = {
  nome: string;
  cpf: string;
  email: string;
  companyId: string;
  profileName: string;
  password?: string;
};

export async function createUser(
  dataSource: DataSource,
  passwordService: PasswordService,
  input: CreateUserFactoryInput,
): Promise<User> {
  const profileRepo = dataSource.getRepository(Profile);
  const userRepo = dataSource.getRepository(User);

  const profile = await profileRepo.findOne({
    where: { nome: input.profileName },
  });
  if (!profile) {
    throw new Error(`Profile not found: ${input.profileName}`);
  }

  const passwordHash = await passwordService.hash(
    input.password || 'Password@123',
  );
  const user = userRepo.create({
    nome: input.nome,
    cpf: input.cpf,
    email: input.email,
    password: passwordHash,
    company_id: input.companyId,
    profile_id: profile.id,
    status: true,
  });

  return userRepo.save(user);
}
